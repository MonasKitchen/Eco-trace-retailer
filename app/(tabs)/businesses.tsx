import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

// ✅ Fixed interface to match schema exactly
interface Business {
  id: string;
  owner_id: string;
  name: string;
  type: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  updated_at: string;
  approved_at?: string;
  rejected_at?: string;
  admin_notes?: string;
  total_transactions?: number;
  last_transaction_date?: string;
}

export default function BusinessListScreen() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      
      // Get current retailer
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (retailerError) {
        console.error('Error fetching retailer data:', retailerError);
        setError('Failed to fetch retailer data');
        setBusinesses([]);
        return;
      }

      if (!retailerData || !retailerData.id) {
        console.error('No retailer data found for user');
        setError('Retailer profile not found');
        setBusinesses([]);
        return;
      }

      // ✅ Get businesses that have transactions with this retailer
      // Step 1: Get retailer's inventory items
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('retailer_inventory')
        .select('id')
        .eq('retailer_id', retailerData.id);

      if (inventoryError) throw inventoryError;

      if (inventoryData && inventoryData.length > 0) {
        const inventoryIds = inventoryData.map(item => item.id).filter(id => id != null);
        
        if (inventoryIds.length === 0) {
          setBusinesses([]);
          return;
        }
        
        // Step 2: Get transactions for these inventory items
        const { data: transactionData, error: transactionError } = await supabase
          .from('inventory_transactions')
          .select('business_id')
          .in('inventory_id', inventoryIds);

        if (transactionError) throw transactionError;

        if (transactionData && transactionData.length > 0) {
          // Step 3: Get unique business IDs, filtering out null values
          const businessIds = [...new Set(transactionData.map(t => t.business_id).filter(id => id != null))];
          
          if (businessIds.length === 0) {
            setBusinesses([]);
            return;
          }
          
          // Step 4: Get business details
          const { data: businessData, error: businessError } = await supabase
            .from('businesses')
            .select(`
              id,
              owner_id,
              name,
              type,
              verification_status,
              created_at,
              updated_at,
              approved_at,
              rejected_at,
              admin_notes
            `)
            .in('id', businessIds);

          if (businessError) throw businessError;
          setBusinesses(businessData || []);
        } else {
          setBusinesses([]);
        }
      } else {
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
      case 'approved': return 'text-green-600';
      case 'pending': return 'text-yellow-600';
      case 'rejected': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'rejected': return 'close-circle';
      default: return 'help-circle';
    }
  };



  // ✅ New function for actual collection flow as per README
  const collectFromBusiness = async (business: Business) => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');
      
      // Get retailer ID
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (retailerError) throw retailerError;
      
      // Get disposal dues for this business
      const { data: dues, error: duesError } = await supabase
        .from('business_disposal_dues')
        .select('*, retailer_disposal_dues!inner(*)')
        .eq('business_id', business.id)
        .eq('retailer_disposal_dues.retailer_id', retailerData.id)
        .eq('retailer_disposal_dues.status', 'pending')
        .order('due_date', { ascending: true });

      if (duesError) throw duesError;

      if (!dues || dues.length === 0) {
        Alert.alert('Info', 'No pending dues for this business');
        return;
      }

      const totalDues = dues.reduce((sum, due) => sum + parseFloat(due.amount), 0);
      
      Alert.alert(
        'Collect Payment',
        `Total pending dues: ₹${totalDues.toFixed(2)}\nProceed with collection?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Collect', 
            onPress: () => processCollection(business, dues, totalDues)
          }
        ]
      );
    } catch (error) {
      console.error('Error checking dues:', error);
      Alert.alert('Error', 'Failed to check business dues');
    }
  };

  // ✅ New function to handle retailer_transactions as per schema
  const processCollection = async (business: Business, dues: any[], totalAmount: number) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Get retailer ID
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (retailerError) throw retailerError;

      if (!retailerData || !retailerData.id) {
        throw new Error('Retailer profile not found');
      }

      // Record retailer transaction
      const { error: transactionError } = await supabase
        .from('retailer_transactions')
        .insert({
          retailer_id: retailerData.id,
          business_id: business.id,
          amount: totalAmount,
          timestamp: new Date().toISOString(),
        });

      if (transactionError) throw transactionError;

      // Mark retailer disposal dues as paid
      const retailerDueIds = dues.map(due => due.retailer_disposal_dues[0].id);
      const { error: updateError } = await supabase
        .from('retailer_disposal_dues')
        .update({ status: 'paid' })
        .in('id', retailerDueIds);
        
      // Also mark business disposal dues as paid
      const businessDueIds = dues.map(due => due.id);
      const { error: businessUpdateError } = await supabase
        .from('business_disposal_dues')
        .update({ status: 'paid' })
        .in('id', businessDueIds);
        
      if (businessUpdateError) throw businessUpdateError;

      if (updateError) throw updateError;

      Alert.alert('Success', `Collected ₹${totalAmount.toFixed(2)} from ${business.name}`);
    } catch (error) {
      console.error('Error processing collection:', error);
      Alert.alert('Error', 'Failed to process collection');
    }
  };



  const renderBusinessItem = ({ item }: { item: Business }) => (
    <TouchableOpacity className="bg-white rounded-lg p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800">{item.name}</Text>
          <Text className="text-gray-600 mt-1">{item.type}</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Business ID: {item.id.slice(0, 8)}...
          </Text>
          {item.approved_at && (
            <Text className="text-sm text-gray-500">
              Approved: {new Date(item.approved_at).toLocaleDateString()}
            </Text>
          )}
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
          onPress={() => collectFromBusiness(item)}
        >
          <Text className="text-green-600 text-center font-medium">Collect Payment</Text>
        </TouchableOpacity>
        
        
      </View>
    </TouchableOpacity>
  );

  // Rest of the component remains the same...
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
        <Text className="text-2xl font-bold text-gray-800 mb-2">Business Customers</Text>
        <Text className="text-gray-600 mb-4">Businesses that have purchased products from your inventory</Text>
      </View>

      <View className="p-4">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-bold text-gray-800">
            Active Customers ({businesses.length})
          </Text>
        </View>

        {businesses.length === 0 ? (
          <View className="bg-white rounded-lg p-8 items-center">
            <Ionicons name="business-outline" size={48} color="#9ca3af" />
            <Text className="text-gray-500 text-center mt-4 text-lg font-medium">
              No business customers yet
            </Text>
            <Text className="text-gray-400 text-center mt-2">
              Businesses will appear here once they purchase products from your inventory
            </Text>
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


      {/* Business Details Modal - Enhanced */}
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
                
                <View>
                  <Text className="text-sm text-gray-500">Registered Date</Text>
                  <Text className="text-gray-800">{new Date(selectedBusiness.created_at).toLocaleDateString()}</Text>
                </View>

                {selectedBusiness.approved_at && (
                  <View>
                    <Text className="text-sm text-gray-500">Approved Date</Text>
                    <Text className="text-gray-800">{new Date(selectedBusiness.approved_at).toLocaleDateString()}</Text>
                  </View>
                )}

                {selectedBusiness.admin_notes && (
                  <View>
                    <Text className="text-sm text-gray-500">Admin Notes</Text>
                    <Text className="text-gray-800">{selectedBusiness.admin_notes}</Text>
                  </View>
                )}
              </View>
            )}

            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                className="flex-1 bg-gray-500 py-3 px-4 rounded-lg"
                onPress={() => setBusinessDetailsModalVisible(false)}
              >
                <Text className="text-white text-center font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}