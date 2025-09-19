import { Ionicons } from '@expo/vector-icons';
import { Href, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface RetailerProfile {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
  address?: string;
  verification_status: string;
  registered_businesses: string[];
  created_at: string;
  location: string;
}

interface Notification {
  id: string;
  type: 'disposal_due' | 'low_inventory' | 'verification';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  created_at: string;
}

export default function HomeScreen() {
  console.log('HomeScreen rendered'); // Debug log
  
  const [collectionSummary, setCollectionSummary] = useState({
    pendingDisposalDues: 0,
    paidDisposalDues: 0,
    totalInventoryItems: 0,
    monthlyTransactions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retailerProfile, setRetailerProfile] = useState<RetailerProfile | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editProfile, setEditProfile] = useState({
    name: '',
    phone_number: '',
    address: '',
    location: '',
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Starting logout process...');
              
              // Clear any local state first
              setRetailerProfile(null);
              setCollectionSummary({
                pendingDisposalDues: 0,
                paidDisposalDues: 0,
                totalInventoryItems: 0,
                monthlyTransactions: 0,
              });
              
              // Sign out from Supabase
              const { error } = await supabase.auth.signOut();
              
              if (error) {
                console.error('Error signing out:', error);
                Alert.alert('Error', 'Failed to logout. Please try again.');
                return;
              }
              
              console.log('Successfully signed out');
              // Don't manually navigate - let the auth guard handle it
              
            } catch (error) {
              console.error('Unexpected error during logout:', error);
              Alert.alert('Error', 'An unexpected error occurred during logout.');
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    fetchRetailerData();
    fetchQuickStats();
    generateNotifications();
  }, []);

  const fetchRetailerData = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data: profile, error: profileError } = await supabase
        .from('retailers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          // Create retailer profile if it doesn't exist
          const { data: newProfile, error: createError } = await supabase
            .from('retailers')
            .insert({
              user_id: user.id,
              name: user.email?.split('@')[0] || 'Retailer',
              email: user.email || '',
              location: 'Not specified',
              verification_status: 'pending',
              registered_businesses: [],
            })
            .select()
            .single();

          if (createError) {
            console.error('Error creating retailer profile:', createError);
            setError('Failed to create retailer profile');
            return;
          }
          
          if (newProfile) {
            setRetailerProfile(newProfile);
          }
        } else {
          console.error('Error fetching retailer profile:', profileError);
          setError('Failed to fetch retailer profile');
          return;
        }
      } else {
        setRetailerProfile(profile);
        setEditProfile({
          name: profile.name || '',
          phone_number: profile.phone_number || '',
          address: profile.address || '',
          location: profile.location || '',
        });
      }
    } catch (error) {
      console.error('Error fetching retailer data:', error);
      setError('Failed to load retailer data');
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    try {
      if (!retailerProfile) return;

      const { error } = await supabase
        .from('retailers')
        .update({
          name: editProfile.name,
          phone_number: editProfile.phone_number,
          address: editProfile.address,
          location: editProfile.location,
          updated_at: new Date().toISOString(),
        })
        .eq('id', retailerProfile.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully');
      setProfileModalVisible(false);
      fetchRetailerData();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const fetchQuickStats = async () => {
    try {
      setLoading(true);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('User not authenticated');
        return;
      }

      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id, registered_businesses')
        .eq('user_id', user.id)
        .maybeSingle();

      if (retailerError) {
        console.error('Error fetching retailer data:', retailerError);
        setError('Failed to fetch retailer data');
        return;
      }

      if (retailerData) {
        // Get disposal dues (money retailer owes to companies)
        const { data: disposalDues } = await supabase
          .from('retailer_disposal_dues')
          .select('amount, status')
          .eq('retailer_id', retailerData.id);

        const pendingDisposalDues = disposalDues
          ?.filter(d => d.status === 'pending')
          .reduce((sum, d) => sum + Number(d.amount), 0) || 0;

        const paidDisposalDues = disposalDues
          ?.filter(d => d.status === 'paid')
          .reduce((sum, d) => sum + Number(d.amount), 0) || 0;

        // Get inventory count
        const { data: inventory } = await supabase
          .from('retailer_inventory')
          .select('quantity')
          .eq('retailer_id', retailerData.id);

        const totalInventoryItems = inventory?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;

        // Get monthly transactions (money received from businesses)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const { data: transactions } = await supabase
          .from('retailer_transactions')
          .select('amount')
          .eq('retailer_id', retailerData.id)
          .gte('timestamp', startOfMonth.toISOString());

        const monthlyTransactions = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        setCollectionSummary({
          pendingDisposalDues,
          paidDisposalDues,
          totalInventoryItems,
          monthlyTransactions,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const generateNotifications = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data: retailerData } = await supabase
        .from('retailers')
        .select('id, verification_status')
        .eq('user_id', user.id)
        .single();

      if (!retailerData) return;

      const newNotifications: Notification[] = [];

      // Verification status notification
      if (retailerData.verification_status === 'pending') {
        newNotifications.push({
          id: 'verification_pending',
          type: 'verification',
          title: 'Verification Pending',
          message: 'Your retailer account is awaiting admin approval.',
          priority: 'medium',
          created_at: new Date().toISOString(),
        });
      } else if (retailerData.verification_status === 'rejected') {
        newNotifications.push({
          id: 'verification_rejected',
          type: 'verification',
          title: 'Verification Rejected',
          message: 'Your retailer account was rejected. Please contact support.',
          priority: 'high',
          created_at: new Date().toISOString(),
        });
      }

      // Check for overdue disposal dues
      const { data: overdueDues } = await supabase
        .from('retailer_disposal_dues')
        .select('*')
        .eq('retailer_id', retailerData.id)
        .eq('status', 'overdue');

      if (overdueDues && overdueDues.length > 0) {
        const totalOverdue = overdueDues.reduce((sum, due) => sum + Number(due.amount), 0);
        newNotifications.push({
          id: 'overdue_disposal_dues',
          type: 'disposal_due',
          title: 'Overdue Disposal Dues',
          message: `₹${totalOverdue.toFixed(2)} in disposal dues are overdue. Pay companies now!`,
          priority: 'high',
          created_at: new Date().toISOString(),
        });
      }

      // Check for pending disposal dues
      const { data: pendingDues } = await supabase
        .from('retailer_disposal_dues')
        .select('*')
        .eq('retailer_id', retailerData.id)
        .eq('status', 'pending');

      if (pendingDues && pendingDues.length > 3) {
        const totalPending = pendingDues.reduce((sum, due) => sum + Number(due.amount), 0);
        newNotifications.push({
          id: 'pending_disposal_dues',
          type: 'disposal_due',
          title: 'Multiple Pending Dues',
          message: `₹${totalPending.toFixed(2)} in disposal dues pending. Plan your payments.`,
          priority: 'medium',
          created_at: new Date().toISOString(),
        });
      }

      // Check for low inventory
      const { data: lowInventory } = await supabase
        .from('retailer_inventory')
        .select('product_name, quantity')
        .eq('retailer_id', retailerData.id)
        .lt('quantity', 5)
        .gt('quantity', 0);

      if (lowInventory && lowInventory.length > 0) {
        newNotifications.push({
          id: 'low_inventory',
          type: 'low_inventory',
          title: 'Low Inventory Alert',
          message: `${lowInventory.length} product(s) running low. Consider restocking.`,
          priority: 'medium',
          created_at: new Date().toISOString(),
        });
      }

      setNotifications(newNotifications);
    } catch (error) {
      console.error('Error generating notifications:', error);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header with Profile */}
      <View className="p-4 bg-white border-b border-gray-200">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-2xl font-bold text-gray-800">Welcome back!</Text>
            <Text className="text-gray-600">
              {retailerProfile?.name || 'Retailer'} • {retailerProfile?.location || 'Location not set'}
            </Text>
          </View>
          <View className="flex-row space-x-2">
            <TouchableOpacity
              onPress={handleLogout}
              className="bg-red-600 p-2 rounded-full"
            >
              <Ionicons name="log-out" size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setProfileModalVisible(true)}
              className="bg-green-600 p-2 rounded-full"
            >
              <Ionicons name="person" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Badge */}
        <View className="flex-row items-center">
          <View className={`px-3 py-1 rounded-full ${
            retailerProfile?.verification_status === 'approved' 
              ? 'bg-green-100' 
              : retailerProfile?.verification_status === 'pending'
              ? 'bg-yellow-100'
              : 'bg-red-100'
          }`}>
            <Text className={`text-sm font-medium ${
              retailerProfile?.verification_status === 'approved' 
                ? 'text-green-800' 
                : retailerProfile?.verification_status === 'pending'
                ? 'text-yellow-800'
                : 'text-red-800'
            }`}>
              {retailerProfile?.verification_status?.toUpperCase() || 'PENDING'}
            </Text>
          </View>
          {retailerProfile?.verification_status === 'pending' && (
            <Text className="text-sm text-gray-600 ml-2">Verification in progress</Text>
          )}
        </View>
      </View>

      <ScrollView className="flex-1 bg-gray-50">
        <View className="p-4">
          {/* Notifications */}
          {notifications.length > 0 && (
            <View className="mb-4">
              <Text className="text-lg font-bold text-gray-800 mb-3">
                <Ionicons name="notifications" size={18} color="#ef4444" /> Notifications
              </Text>
              {notifications.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  className={`p-4 rounded-lg mb-3 border-l-4 ${
                    notification.priority === 'high' 
                      ? 'bg-red-50 border-red-500' 
                      : notification.priority === 'medium'
                      ? 'bg-yellow-50 border-yellow-500'
                      : 'bg-blue-50 border-blue-500'
                  }`}
                  onPress={() => {
                    if (notification.type === 'disposal_due') {
                      router.push('/(tabs)/payments' as Href);
                    } else if (notification.type === 'low_inventory') {
                      router.push('/(tabs)/products');
                    }
                  }}
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className={`font-semibold mb-1 ${
                        notification.priority === 'high' 
                          ? 'text-red-800' 
                          : notification.priority === 'medium'
                          ? 'text-yellow-800'
                          : 'text-blue-800'
                      }`}>
                        {notification.title}
                      </Text>
                      <Text className="text-gray-600 text-sm">
                        {notification.message}
                      </Text>
                    </View>
                    <Ionicons 
                      name="chevron-forward" 
                      size={16} 
                      color={
                        notification.priority === 'high' 
                          ? '#dc2626' 
                          : notification.priority === 'medium'
                          ? '#d97706'
                          : '#2563eb'
                      }
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Summary Cards */}
          <View className="space-y-4">
            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="warning" size={24} color="#ef4444" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Pending Disposal Dues</Text>
              </View>
              <Text className="text-2xl font-bold text-red-600 mt-2">
                ₹{collectionSummary.pendingDisposalDues.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500">Owed to companies</Text>
            </View>

            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="wallet" size={24} color="#16a34a" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Monthly Revenue</Text>
              </View>
              <Text className="text-2xl font-bold text-green-600 mt-2">
                ₹{collectionSummary.monthlyTransactions.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500">From business sales</Text>
            </View>

            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="cube" size={24} color="#3b82f6" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Total Inventory</Text>
              </View>
              <Text className="text-2xl font-bold text-blue-600 mt-2">
                {collectionSummary.totalInventoryItems}
              </Text>
              <Text className="text-sm text-gray-500">Items in stock</Text>
            </View>

            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={24} color="#8b5cf6" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Paid Dues</Text>
              </View>
              <Text className="text-2xl font-bold text-purple-600 mt-2">
                ₹{collectionSummary.paidDisposalDues.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500">Total paid to companies</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View className="mt-6">
            <Text className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</Text>
            <View className="flex-row flex-wrap gap-3">
              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/products')}
                className="bg-green-600 rounded-lg p-4 flex-1 min-w-[140px]"
              >
                <Ionicons name="add-circle" size={24} color="white" />
                <Text className="text-white font-semibold mt-2">Manage Inventory</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/payments' as Href)}
                className="bg-blue-600 rounded-lg p-4 flex-1 min-w-[140px]"
              >
                <Ionicons name="card" size={24} color="white" />
                <Text className="text-white font-semibold mt-2">Pay Dues</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Profile Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View className="flex-1 bg-black bg-opacity-50 justify-center items-center p-4">
          <View className="bg-white rounded-lg p-6 w-full max-w-md">
            <Text className="text-xl font-bold text-gray-800 mb-4">Edit Profile</Text>
            
            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Retailer Name</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.name}
                  onChangeText={(text) => setEditProfile({ ...editProfile, name: text })}
                  placeholder="Enter retailer name"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Phone Number</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.phone_number}
                  onChangeText={(text) => setEditProfile({ ...editProfile, phone_number: text })}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Address</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.address}
                  onChangeText={(text) => setEditProfile({ ...editProfile, address: text })}
                  placeholder="Enter address"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Location</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.location}
                  onChangeText={(text) => setEditProfile({ ...editProfile, location: text })}
                  placeholder="Enter location/city"
                />
              </View>
            </View>

            <View className="space-y-3 mt-6">
              <View className="flex-row space-x-3">
                <TouchableOpacity
                  className="flex-1 bg-gray-500 py-3 px-4 rounded-lg"
                  onPress={() => setProfileModalVisible(false)}
                >
                  <Text className="text-white text-center font-semibold">Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  className="flex-1 bg-green-600 py-3 px-4 rounded-lg"
                  onPress={updateProfile}
                >
                  <Text className="text-white text-center font-semibold">Update</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity
                className="bg-red-600 py-3 px-4 rounded-lg"
                onPress={() => {
                  setProfileModalVisible(false);
                  handleLogout();
                }}
              >
                <Text className="text-white text-center font-semibold">Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}