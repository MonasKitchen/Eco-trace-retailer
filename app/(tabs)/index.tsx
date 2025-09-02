import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface RetailerProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  business_type: string;
  verification_status: string;
  registered_businesses: number[];
  created_at: string;
}

interface Notification {
  id: string;
  type: 'payment_due' | 'company_payment' | 'low_inventory' | 'business_registration';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  created_at: string;
}

export default function HomeScreen() {
  const [collectionSummary, setCollectionSummary] = useState({
    totalCollected: 0,
    pendingPayments: 0,
    businessCount: 0,
    monthlyRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retailerProfile, setRetailerProfile] = useState<RetailerProfile | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editProfile, setEditProfile] = useState({
    name: '',
    phone: '',
    address: '',
    business_type: '',
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);

  console.log('HomeScreen rendering...'); // Debug log

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error signing out', error.message);
  };

  useEffect(() => {
    console.log('HomeScreen useEffect triggered'); // Debug log
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
        // Create retailer profile if it doesn't exist
        if (profileError.code === 'PGRST116') {
          const { data: newProfile, error: createError } = await supabase
            .from('retailers')
            .insert({
              user_id: user.id,
              name: user.email?.split('@')[0] || 'Retailer',
              email: user.email || '',
              business_type: 'General Retail',
              verification_status: 'pending',
              registered_businesses: [],
            })
            .select()
            .single();

          if (!createError && newProfile) {
            setRetailerProfile(newProfile);
          }
        }
      } else {
        setRetailerProfile(profile);
        setEditProfile({
          name: profile.name || '',
          phone: profile.phone || '',
          address: profile.address || '',
          business_type: profile.business_type || '',
        });
      }
    } catch (error) {
      console.error('Error fetching retailer data:', error);
    }
  };

  const updateProfile = async () => {
    try {
      if (!retailerProfile) return;

      const { error } = await supabase
        .from('retailers')
        .update({
          name: editProfile.name,
          phone: editProfile.phone,
          address: editProfile.address,
          business_type: editProfile.business_type,
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
      
      // Get current retailer
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
        // Fetch total collected this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const { data: transactions } = await supabase
          .from('retailer_transactions')
          .select('amount')
          .eq('retailer_id', retailerData.id)
          .gte('timestamp', startOfMonth.toISOString());

        const totalCollected = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        // Fetch pending payments
        if (retailerData.registered_businesses?.length > 0) {
          const businessIds = retailerData.registered_businesses.map((id: any) => id.toString());
          
          const { data: duesData } = await supabase
            .from('disposal_dues')
            .select('amount')
            .in('business_id', businessIds)
            .eq('status', 'pending');

          const pendingPayments = duesData?.reduce((sum, d) => sum + Number(d.amount), 0) || 0;

          setCollectionSummary({
            totalCollected,
            pendingPayments,
            businessCount: retailerData.registered_businesses.length,
            monthlyRevenue: totalCollected,
          });
        } else {
          setCollectionSummary({
            totalCollected,
            pendingPayments: 0,
            businessCount: 0,
            monthlyRevenue: totalCollected,
          });
        }
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
        .select('id, registered_businesses')
        .eq('user_id', user.id)
        .single();

      if (!retailerData) return;

      const newNotifications: Notification[] = [];

      // Check for overdue payments
      if (retailerData.registered_businesses?.length > 0) {
        const { data: overdueDues } = await supabase
          .from('disposal_dues')
          .select('*')
          .in('business_id', retailerData.registered_businesses.map(id => id.toString()))
          .eq('status', 'pending')
          .lt('due_date', new Date().toISOString());

        if (overdueDues && overdueDues.length > 0) {
          newNotifications.push({
            id: 'overdue_payments',
            type: 'payment_due',
            title: 'Overdue Payments',
            message: `${overdueDues.length} payment(s) are overdue. Collect them now!`,
            priority: 'high',
            created_at: new Date().toISOString(),
          });
        }
      }

      // Check for low inventory
      const { data: lowInventory } = await supabase
        .from('retailer_inventory')
        .select('*')
        .eq('retailer_id', retailerData.id)
        .lt('quantity', 10)
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

      // Check for companies to pay
      const { data: inventoryData } = await supabase
        .from('retailer_inventory')
        .select(`
          quantity,
          company_product:company_products(
            disposal_cost,
            company:companies(id, name)
          )
        `)
        .eq('retailer_id', retailerData.id)
        .gt('quantity', 0);

      if (inventoryData) {
        const companyOwed: { [key: string]: number } = {};
        inventoryData.forEach((item: any) => {
          if (item.company_product?.company) {
            const companyId = item.company_product.company.id;
            const owedAmount = item.quantity * item.company_product.disposal_cost;
            companyOwed[companyId] = (companyOwed[companyId] || 0) + owedAmount;
          }
        });

        const companiesWithDebt = Object.keys(companyOwed).filter(id => companyOwed[id] > 100);
        if (companiesWithDebt.length > 0) {
          newNotifications.push({
            id: 'company_payments',
            type: 'company_payment',
            title: 'Company Payments Due',
            message: `You owe money to ${companiesWithDebt.length} company(ies). Pay to maintain good relationships.`,
            priority: 'medium',
            created_at: new Date().toISOString(),
          });
        }
      }

      setNotifications(newNotifications);
    } catch (error) {
      console.error('Error generating notifications:', error);
    }
  };

  if (loading) {
    console.log('HomeScreen showing loading state'); // Debug log
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading dashboard...</Text>
      </View>
    );
  }

  console.log('HomeScreen rendering main content'); // Debug log

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header with Profile */}
      <View className="p-4 bg-white border-b border-gray-200">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-2xl font-bold text-gray-800">Welcome back!</Text>
            <Text className="text-gray-600">
              {retailerProfile?.name || 'Retailer'} • {retailerProfile?.business_type || 'General Retail'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setProfileModalVisible(true)}
            className="bg-green-600 p-2 rounded-full"
          >
            <Ionicons name="person" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Status Badge */}
        <View className="flex-row items-center">
          <View className={`px-3 py-1 rounded-full ${
            retailerProfile?.verification_status === 'verified' 
              ? 'bg-green-100' 
              : retailerProfile?.verification_status === 'pending'
              ? 'bg-yellow-100'
              : 'bg-red-100'
          }`}>
            <Text className={`text-sm font-medium ${
              retailerProfile?.verification_status === 'verified' 
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
                    if (notification.type === 'payment_due') {
                      router.push('/(tabs)/collection');
                    } else if (notification.type === 'company_payment') {
                      router.push('/(tabs)/collection?tab=companies');
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
                <Ionicons name="wallet" size={24} color="#16a34a" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Total Collected</Text>
              </View>
              <Text className="text-2xl font-bold text-green-600 mt-2">
                ₹{collectionSummary.totalCollected.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500">This month</Text>
            </View>

            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="business" size={24} color="#3b82f6" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Registered Businesses</Text>
              </View>
              <Text className="text-2xl font-bold text-blue-600 mt-2">
                {collectionSummary.businessCount}
              </Text>
              <Text className="text-sm text-gray-500">Active partners</Text>
            </View>

            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="time" size={24} color="#f59e0b" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Pending Payments</Text>
              </View>
              <Text className="text-2xl font-bold text-yellow-600 mt-2">
                ₹{collectionSummary.pendingPayments.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500">To be collected</Text>
            </View>

            <View className="bg-white rounded-lg p-4 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="trending-up" size={24} color="#8b5cf6" />
                <Text className="ml-2 text-lg font-semibold text-gray-800">Monthly Revenue</Text>
              </View>
              <Text className="text-2xl font-bold text-purple-600 mt-2">
                ₹{collectionSummary.monthlyRevenue.toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-500">Current month</Text>
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
                <Text className="text-white font-semibold mt-2">Add Product</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/collection')}
                className="bg-blue-600 rounded-lg p-4 flex-1 min-w-[140px]"
              >
                <Ionicons name="card" size={24} color="white" />
                <Text className="text-white font-semibold mt-2">Collect Payment</Text>
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
                <Text className="text-sm font-medium text-gray-700 mb-1">Business Name</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.name}
                  onChangeText={(text) => setEditProfile({ ...editProfile, name: text })}
                  placeholder="Enter business name"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Phone Number</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.phone}
                  onChangeText={(text) => setEditProfile({ ...editProfile, phone: text })}
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
                  placeholder="Enter business address"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Business Type</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-3 py-2"
                  value={editProfile.business_type}
                  onChangeText={(text) => setEditProfile({ ...editProfile, business_type: text })}
                  placeholder="Enter business type"
                />
              </View>
            </View>

            <View className="flex-row space-x-3 mt-6">
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
          </View>
        </View>
      </Modal>
    </View>
  );
}