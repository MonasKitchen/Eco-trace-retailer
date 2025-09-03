import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Business {
  id: string;
  name: string;
  type: string;
  verification_status: string;
  owner_id: string;
  created_at: string;
  contact_person?: string;
  email?: string;
  phone_number?: string;
  address?: string;
}

export default function BusinessListScreen() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newBusiness, setNewBusiness] = useState({
    name: '',
    type: '',
    contact_person: '',
    email: '',
    phone_number: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [availableBusinesses, setAvailableBusinesses] = useState<Business[]>([]);
  const [addBusinessModalVisible, setAddBusinessModalVisible] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [businessDetailsModalVisible, setBusinessDetailsModalVisible] = useState(false);

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('User not authenticated');
        return;
      }
      
      // First get the current retailer
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('registered_businesses')
        .eq('user_id', user.id)
        .maybeSingle();

      if (retailerError) {
        console.error('Error fetching retailer data:', retailerError);
        setError('Failed to fetch retailer data');
        setBusinesses([]);
        return;
      }

      // Type assertion to handle the Supabase type inference
      const retailer = retailerData as { registered_businesses: number[] } | null;

      if (retailer?.registered_businesses && retailer.registered_businesses.length > 0) {
        // Convert number array to string array for the IN query since business IDs are strings
        const businessIds = retailer.registered_businesses.map(id => id.toString());
        
        // Fetch businesses linked to this retailer
        const { data: businessData, error } = await supabase
          .from('businesses')
          .select('*')
          .in('id', businessIds);

        if (error) throw error;
        setBusinesses(businessData || []);
      } else {
        // No businesses registered yet
        setBusinesses([]);
      }
    } catch (error) {
      console.error('Error fetching businesses:', error);
      setError('Failed to fetch businesses');
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'text-green-600';
      case 'pending': return 'text-yellow-600';
      case 'rejected': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'rejected': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const addBusiness = async () => {
    if (!newBusiness.name || !newBusiness.type) {
      Alert.alert('Error', 'Please fill business name and type');
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Create business record
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .insert({
          name: newBusiness.name,
          type: newBusiness.type,
          owner_id: user.id,
          verification_status: 'pending',
        })
        .select()
        .single();

      if (businessError) throw businessError;

      // Add business to retailer's registered businesses
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('registered_businesses')
        .eq('user_id', user.id)
        .single();

      if (retailerError) throw retailerError;

      const currentBusinesses = retailerData.registered_businesses || [];
      const updatedBusinesses = [...currentBusinesses, businessData.id];

      const { error: updateError } = await supabase
        .from('retailers')
        .update({ registered_businesses: updatedBusinesses })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      Alert.alert('Success', 'Business registered successfully');
      setModalVisible(false);
      setNewBusiness({ name: '', type: '', contact_person: '', email: '', phone_number: '' });
      fetchBusinesses();
    } catch (error) {
      console.error('Error adding business:', error);
      Alert.alert('Error', 'Failed to register business');
    }
  };

  const addBusinessToRetailer = async (business: Business) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Get current retailer
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id, registered_businesses')
        .eq('user_id', user.id)
        .single();

      if (retailerError) throw retailerError;

      const currentBusinesses = retailerData.registered_businesses || [];
      if (currentBusinesses.includes(Number(business.id))) {
        Alert.alert('Info', 'Business is already registered with this retailer');
        return;
      }

      // Add business to retailer's registered businesses
      const updatedBusinesses = [...currentBusinesses, Number(business.id)];
      
      const { error: updateError } = await supabase
        .from('retailers')
        .update({ registered_businesses: updatedBusinesses })
        .eq('id', retailerData.id);

      if (updateError) throw updateError;

      Alert.alert('Success', 'Business added to retailer network');
      setAddBusinessModalVisible(false);
      fetchBusinesses();
    } catch (error) {
      console.error('Error adding business:', error);
      Alert.alert('Error', 'Failed to add business');
    }
  };

  const generateSampleDisposalDue = async (business: Business) => {
    try {
      const randomAmount = Math.floor(Math.random() * 500) + 100; // ₹100-₹600
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30) + 1); // 1-30 days from now

      const { error } = await supabase
        .from('disposal_dues')
        .insert({
          business_id: business.id,
          amount: randomAmount,
          due_date: dueDate.toISOString().split('T')[0], // YYYY-MM-DD format
          status: 'pending',
        });

      if (error) throw error;

      Alert.alert('Success', `Sample disposal due of ₹${randomAmount} created for ${business.name}`);
    } catch (error) {
      console.error('Error creating sample disposal due:', error);
      Alert.alert('Error', 'Failed to create sample disposal due');
    }
  };

  const removeBusinessFromRetailer = async (businessId: string) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Get current retailer
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id, registered_businesses')
        .eq('user_id', user.id)
        .single();

      if (retailerError) throw retailerError;

      const currentBusinesses = retailerData.registered_businesses || [];
      const updatedBusinesses = currentBusinesses.filter((id: number) => id !== Number(businessId));
      
      const { error: updateError } = await supabase
        .from('retailers')
        .update({ registered_businesses: updatedBusinesses })
        .eq('id', retailerData.id);

      if (updateError) throw updateError;

      Alert.alert('Success', 'Business removed from retailer network');
      fetchBusinesses();
    } catch (error) {
      console.error('Error removing business:', error);
      Alert.alert('Error', 'Failed to remove business');
    }
  };

  const searchAvailableBusinesses = async (query: string) => {
    if (query.length < 2) {
      setAvailableBusinesses([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .ilike('name', `%${query}%`)
        .eq('verification_status', 'verified')
        .limit(10);

      if (error) throw error;
      setAvailableBusinesses(data || []);
    } catch (error) {
      console.error('Error searching businesses:', error);
    }
  };

  const renderBusinessItem = ({ item }: { item: Business }) => (
    <TouchableOpacity className="bg-white rounded-lg p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800">{item.name}</Text>
          <Text className="text-gray-600 mt-1">{item.type}</Text>
          {item.contact_person && (
            <Text className="text-sm text-gray-500 mt-1">Contact: {item.contact_person}</Text>
          )}
          <Text className="text-sm text-gray-500 mt-1">
            Registered: {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        
        <View className="flex-row items-center">
          <Ionicons 
            name={getStatusIcon(item.verification_status)} 
            size={20} 
            color={item.verification_status === 'verified' ? '#16a34a' : 
                   item.verification_status === 'pending' ? '#f59e0b' : '#ef4444'} 
          />
          <Text className={`ml-1 text-sm font-medium ${getStatusColor(item.verification_status)}`}>
            {item.verification_status.charAt(0).toUpperCase() + item.verification_status.slice(1)}
          </Text>
        </View>
      </View>
      
      <View className="flex-row mt-3 space-x-2">
        <TouchableOpacity 
          className="bg-blue-100 rounded-lg px-3 py-2 flex-1"
          onPress={() => {
            setSelectedBusiness(item);
            setBusinessDetailsModalVisible(true);
          }}
        >
          <Text className="text-blue-600 text-center font-medium">View Details</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          className="bg-green-100 rounded-lg px-3 py-2 flex-1"
          onPress={() => router.push('/(tabs)/collection')}
        >
          <Text className="text-green-600 text-center font-medium">Collect Payment</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          className="bg-yellow-100 rounded-lg px-3 py-2 flex-1"
          onPress={() => generateSampleDisposalDue(item)}
        >
          <Text className="text-yellow-600 text-center font-medium text-xs">Sample Due</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading businesses...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 px-4">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-red-600 text-center mt-4 text-lg font-medium">{error}</Text>
        <TouchableOpacity 
          onPress={fetchBusinesses}
          className="bg-green-600 rounded-lg px-6 py-3 mt-4"
        >
          <Text className="text-white font-medium">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="p-4 bg-white border-b border-gray-200">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Business Network</Text>
        <Text className="text-gray-600 mb-4">Manage businesses linked to your retailer account</Text>
        
        <View className="flex-row space-x-2">
          <TouchableOpacity
            className="flex-1 bg-green-600 py-3 px-4 rounded-lg"
            onPress={() => setModalVisible(true)}
          >
            <Text className="text-white text-center font-semibold">Add New Business</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            className="flex-1 bg-blue-600 py-3 px-4 rounded-lg"
            onPress={() => setAddBusinessModalVisible(true)}
          >
            <Text className="text-white text-center font-semibold">Register Existing</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="p-4">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-bold text-gray-800">
            Registered Businesses ({businesses.length})
          </Text>
          <TouchableOpacity 
            onPress={() => setModalVisible(true)}
            className="bg-green-600 rounded-lg px-4 py-2"
          >
            <Text className="text-white font-medium">Add Business</Text>
          </TouchableOpacity>
        </View>

        {businesses.length === 0 ? (
          <View className="bg-white rounded-lg p-8 items-center">
            <Ionicons name="business-outline" size={48} color="#9ca3af" />
            <Text className="text-gray-500 text-center mt-4 text-lg font-medium">
              No businesses registered yet
            </Text>
            <Text className="text-gray-400 text-center mt-2">
              Start by adding your first business partner
            </Text>
            <TouchableOpacity 
              onPress={() => setModalVisible(true)}
              className="bg-green-600 rounded-lg px-6 py-3 mt-4"
            >
              <Text className="text-white font-medium">Add First Business</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={businesses}
            renderItem={renderBusinessItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Add Business Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-lg p-6 m-4 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-800 mb-4">Register New Business</Text>
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-3"
              placeholder="Business Name"
              value={newBusiness.name}
              onChangeText={(text) => setNewBusiness({ ...newBusiness, name: text })}
            />
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-3"
              placeholder="Business Type"
              value={newBusiness.type}
              onChangeText={(text) => setNewBusiness({ ...newBusiness, type: text })}
            />
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-3"
              placeholder="Contact Person (Optional)"
              value={newBusiness.contact_person}
              onChangeText={(text) => setNewBusiness({ ...newBusiness, contact_person: text })}
            />
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-3"
              placeholder="Email (Optional)"
              value={newBusiness.email}
              onChangeText={(text) => setNewBusiness({ ...newBusiness, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Phone Number (Optional)"
              value={newBusiness.phone_number}
              onChangeText={(text) => setNewBusiness({ ...newBusiness, phone_number: text })}
              keyboardType="phone-pad"
            />
            
            <View className="flex-row space-x-3">
              <TouchableOpacity 
                onPress={() => setModalVisible(false)}
                className="flex-1 bg-gray-200 rounded-lg py-3"
              >
                <Text className="text-white font-medium">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={addBusiness}
                className="flex-1 bg-green-600 rounded-lg py-3"
              >
                <Text className="text-white font-medium">Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Existing Business Modal */}
      <Modal
        visible={addBusinessModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddBusinessModalVisible(false)}
      >
        <View className="flex-1 bg-black bg-opacity-50 justify-center items-center p-4">
          <View className="bg-white rounded-lg p-6 w-full max-w-md">
            <Text className="text-xl font-bold text-gray-800 mb-4">Register Existing Business</Text>
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Search business name..."
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                searchAvailableBusinesses(text);
              }}
            />

            <FlatList
              data={availableBusinesses}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View className="flex-row justify-between items-center p-3 border-b border-gray-200">
                  <View>
                    <Text className="font-semibold text-gray-800">{item.name}</Text>
                    <Text className="text-gray-600 text-sm">{item.type}</Text>
                  </View>
                  <TouchableOpacity
                    className="bg-green-600 px-3 py-1 rounded"
                    onPress={() => addBusinessToRetailer(item)}
                  >
                    <Text className="text-white text-sm">Add</Text>
                  </TouchableOpacity>
                </View>
              )}
              className="max-h-64"
            />

            <TouchableOpacity
              className="bg-gray-500 py-3 px-4 rounded-lg mt-4"
              onPress={() => setAddBusinessModalVisible(false)}
            >
              <Text className="text-white text-center font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Business Details Modal */}
      <Modal
        visible={businessDetailsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBusinessDetailsModalVisible(false)}
      >
        <View className="flex-1 bg-black bg-opacity-50 justify-center items-center p-4">
          <View className="bg-white rounded-lg p-6 w-full max-w-md">
            <Text className="text-xl font-bold text-gray-800 mb-4">Business Details</Text>
            
            {selectedBusiness && (
              <View className="space-y-3">
                <View>
                  <Text className="text-sm text-gray-500">Business Name</Text>
                  <Text className="text-lg font-semibold text-gray-800">{selectedBusiness.name}</Text>
                </View>
                
                <View>
                  <Text className="text-sm text-gray-500">Type</Text>
                  <Text className="text-gray-800">{selectedBusiness.type}</Text>
                </View>
                
                <View>
                  <Text className="text-sm text-gray-500">Status</Text>
                  <View className="flex-row items-center mt-1">
                    <Ionicons 
                      name={getStatusIcon(selectedBusiness.verification_status)} 
                      size={16} 
                      color={selectedBusiness.verification_status === 'verified' ? '#16a34a' : 
                             selectedBusiness.verification_status === 'pending' ? '#f59e0b' : '#ef4444'} 
                    />
                    <Text className={`ml-2 font-medium ${getStatusColor(selectedBusiness.verification_status)}`}>
                      {selectedBusiness.verification_status.charAt(0).toUpperCase() + selectedBusiness.verification_status.slice(1)}
                    </Text>
                  </View>
                </View>
                
                {selectedBusiness.contact_person && (
                  <View>
                    <Text className="text-sm text-gray-500">Contact Person</Text>
                    <Text className="text-gray-800">{selectedBusiness.contact_person}</Text>
                  </View>
                )}
                
                {selectedBusiness.email && (
                  <View>
                    <Text className="text-sm text-gray-500">Email</Text>
                    <Text className="text-gray-800">{selectedBusiness.email}</Text>
                  </View>
                )}
                
                {selectedBusiness.phone_number && (
                  <View>
                    <Text className="text-sm text-gray-500">Phone</Text>
                    <Text className="text-gray-800">{selectedBusiness.phone_number}</Text>
                  </View>
                )}
                
                <View>
                  <Text className="text-sm text-gray-500">Registered Date</Text>
                  <Text className="text-gray-800">{new Date(selectedBusiness.created_at).toLocaleDateString()}</Text>
                </View>
              </View>
            )}

            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                className="flex-1 bg-gray-500 py-3 px-4 rounded-lg"
                onPress={() => setBusinessDetailsModalVisible(false)}
              >
                <Text className="text-white text-center font-semibold">Close</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                className="flex-1 bg-red-500 py-3 px-4 rounded-lg"
                onPress={() => {
                  Alert.alert(
                    'Remove Business',
                    `Are you sure you want to remove ${selectedBusiness?.name} from your network?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Remove', 
                        style: 'destructive',
                        onPress: () => {
                          if (selectedBusiness) {
                            removeBusinessFromRetailer(selectedBusiness.id);
                            setBusinessDetailsModalVisible(false);
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <Text className="text-white text-center font-semibold">Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}