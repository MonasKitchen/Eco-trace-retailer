import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Company {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone_number: string;
  address: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  disposal_cost: number;
  company_id: string;
  created_at: string;
  product_type?: 'consumer_product' | 'plastic_material';
  description?: string;
  plastic_components?: {
    type: string;
    weight_grams: number;
    disposal_cost_per_gram: number;
  }[];
  brand?: string;
  barcode?: string;
}

export default function CompanyProductsScreen() {
  const { companyId, companyName } = useLocalSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [purchaseDetails, setPurchaseDetails] = useState({
    quantity: '',
    unitPrice: '',
  });

  useEffect(() => {
    if (companyId) {
      fetchCompanyDetails();
      fetchCompanyProducts();
    }
  }, [companyId]);

  const fetchCompanyDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) throw error;
      setCompany(data);
    } catch (error) {
      console.error('Error fetching company details:', error);
      Alert.alert('Error', 'Failed to fetch company details');
    }
  };

  const fetchCompanyProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('company_products')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Error', 'Failed to fetch products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCompanyDetails();
    fetchCompanyProducts();
  };

  const handleBuyProduct = (product: Product) => {
    setSelectedProduct(product);
    setPurchaseDetails({ quantity: '', unitPrice: '' });
    setBuyModalVisible(true);
  };

  const confirmPurchase = async () => {
    if (!selectedProduct || !purchaseDetails.quantity || !purchaseDetails.unitPrice) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    try {
      // Get current user and retailer
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (retailerError) {
        Alert.alert('Error', 'Retailer profile not found');
        return;
      }

      // Check if product already exists in inventory
      const { data: existingInventory, error: checkError } = await supabase
        .from('retailer_inventory')
        .select('*')
        .eq('retailer_id', retailerData.id)
        .eq('company_product_id', selectedProduct.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      let inventoryId: string;
      
      if (existingInventory) {
        // Update existing inventory
        const { error: updateError } = await supabase
          .from('retailer_inventory')
          .update({
            quantity: existingInventory.quantity + parseInt(purchaseDetails.quantity),
            unit_price: parseFloat(purchaseDetails.unitPrice),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingInventory.id);

        if (updateError) throw updateError;
        inventoryId = existingInventory.id;
      } else {
        // Create new inventory item
        const { data: newInventory, error: insertError } = await supabase
          .from('retailer_inventory')
          .insert({
            company_product_id: selectedProduct.id,
            retailer_id: retailerData.id,
            quantity: parseInt(purchaseDetails.quantity),
            unit_price: parseFloat(purchaseDetails.unitPrice),
            status: 'available',
            plastic_quantity_grams: 0, // Will be set based on product specs
            plastic_cost_per_gram: selectedProduct.disposal_cost,
            total_plastic_cost: selectedProduct.disposal_cost * parseInt(purchaseDetails.quantity),
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        inventoryId = newInventory.id;
      }

      // Calculate total amount for transactions
      const totalAmount = parseInt(purchaseDetails.quantity) * parseFloat(purchaseDetails.unitPrice);

      // Create inventory transaction record for audit trail
      const { error: transactionError } = await supabase
        .from('inventory_transactions')
        .insert({
          inventory_id: inventoryId,
          business_id: null, // This is a retailer purchase from company, not business purchase
          quantity: parseInt(purchaseDetails.quantity),
          transaction_type: 'purchase',
          unit_price: parseFloat(purchaseDetails.unitPrice),
          total_amount: totalAmount,
          plastic_quantity_purchased: 0, // Set based on product specs if available
          plastic_disposal_cost: selectedProduct.disposal_cost * parseInt(purchaseDetails.quantity),
          timestamp: new Date().toISOString(),
        });

      if (transactionError) {
        console.error('Transaction record creation failed:', transactionError);
        // Don't fail the whole operation for this
      }

      // Create company payment record for audit trail
      const { error: paymentError } = await supabase
        .from('company_payments')
        .insert({
          company_id: companyId,
          retailer_id: retailerData.id,
          amount: totalAmount,
          status: 'completed',
          timestamp: new Date().toISOString(),
        });

      if (paymentError) {
        console.error('Payment record creation failed:', paymentError);
        Alert.alert('Warning', 'Product purchased successfully but payment record failed to save. Please contact support.');
      }

      Alert.alert('Purchase Complete', 
        `Successfully purchased ${purchaseDetails.quantity} units of ${selectedProduct.name}\n\n` +
        `Total Cost: ₹${totalAmount.toFixed(2)}\n` +
        `Disposal Cost: ₹${(selectedProduct.disposal_cost * parseInt(purchaseDetails.quantity)).toFixed(2)}\n\n` +
        `Payment recorded and inventory updated.`
      );
      setBuyModalVisible(false);
      setSelectedProduct(null);
      setPurchaseDetails({ quantity: '', unitPrice: '' });

    } catch (error) {
      console.error('Error purchasing product:', error);
      Alert.alert('Error', 'Failed to purchase product');
    }
  };

  const renderProductItem = ({ item }: { item: Product }) => (
    <View className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <View className="flex-row items-center mb-2">
            <Text className="text-lg font-semibold text-gray-800">
              {item.name}
            </Text>
            {item.brand && (
              <View className="bg-blue-100 px-2 py-1 rounded-full ml-2">
                <Text className="text-xs text-blue-800 font-medium">{item.brand}</Text>
              </View>
            )}
          </View>
          
          <Text className="text-sm text-gray-600 mb-2">
            Category: {item.category}
          </Text>
          
          {item.description && (
            <Text className="text-sm text-gray-500 mb-2">
              {item.description}
            </Text>
          )}
          
          {item.plastic_components && item.plastic_components.length > 0 && (
            <View className="bg-gray-50 p-3 rounded-lg mb-2">
              <Text className="text-sm font-medium text-gray-700 mb-1">Plastic Components:</Text>
              {item.plastic_components.map((component, index) => (
                <Text key={index} className="text-xs text-gray-600">
                  • {component.type}: {component.weight_grams}g (₹{component.disposal_cost_per_gram}/g)
                </Text>
              ))}
            </View>
          )}
          
          <View className="flex-row justify-between items-center">
            <Text className="text-lg font-bold text-green-600">
              Plastic Disposal: ₹{item.disposal_cost}/unit
            </Text>
            {item.barcode && (
              <Text className="text-xs text-gray-400">#{item.barcode}</Text>
            )}
          </View>
        </View>
      </View>
      
      <TouchableOpacity
        className="bg-blue-600 rounded-lg py-3 px-4 mt-3"
        onPress={() => handleBuyProduct(item)}
      >
        <Text className="text-white text-center font-semibold">Purchase Product for Store</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#16a34a" />
        <Text className="mt-2 text-gray-600">Loading products...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-800 flex-1">
            {companyName || company?.name} - Products
          </Text>
          <TouchableOpacity onPress={onRefresh}>
            <Ionicons name="refresh" size={24} color="#16a34a" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={products}
        renderItem={renderProductItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          company ? (
            <View className="bg-white rounded-lg p-4 mb-4 shadow-sm">
              <Text className="text-xl font-bold text-gray-800 mb-3">
                Company Information
              </Text>
              
              <View className="space-y-3">
                <View>
                  <Text className="text-sm text-gray-500">Contact Person</Text>
                  <Text className="text-base text-gray-800">{company.contact_person}</Text>
                </View>
                
                <View>
                  <Text className="text-sm text-gray-500">Email</Text>
                  <Text className="text-base text-gray-800">{company.email}</Text>
                </View>
                
                {company.phone_number && (
                  <View>
                    <Text className="text-sm text-gray-500">Phone</Text>
                    <Text className="text-base text-gray-800">{company.phone_number}</Text>
                  </View>
                )}
                
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text className="text-sm text-green-600 ml-1 font-medium">
                    Verified Company
                  </Text>
                </View>
              </View>
              
              <View className="mt-4">
                <Text className="text-lg font-semibold text-gray-800">
                  Available Products ({products.length})
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center py-8">
            <Ionicons name="cube-outline" size={64} color="#9ca3af" />
            <Text className="text-gray-500 text-lg mt-4">No products available</Text>
            <Text className="text-gray-400 text-sm mt-2">
              This company hasn&apos;t added any products yet
            </Text>
          </View>
        }
      />

      {/* Purchase Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={buyModalVisible}
        onRequestClose={() => setBuyModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-lg p-6 m-4 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Purchase {selectedProduct?.name}
            </Text>
            
            <View className="mb-4">
              {selectedProduct?.brand && (
                <Text className="text-sm text-gray-600 mb-1">
                  Brand: {selectedProduct.brand}
                </Text>
              )}
              <Text className="text-sm text-gray-600 mb-1">
                Product Category: {selectedProduct?.category}
              </Text>
              <Text className="text-sm font-medium text-green-700 mb-2">
                Plastic Disposal Cost: ₹{selectedProduct?.disposal_cost}/unit
              </Text>
              {selectedProduct?.description && (
                <Text className="text-xs text-gray-500 mb-3">
                  {selectedProduct.description}
                </Text>
              )}
            </View>
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-3"
              placeholder="Quantity (units to stock)"
              value={purchaseDetails.quantity}
              onChangeText={(text) => setPurchaseDetails({ ...purchaseDetails, quantity: text })}
              keyboardType="numeric"
            />
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Your Selling Price per Unit (₹)"
              value={purchaseDetails.unitPrice}
              onChangeText={(text) => setPurchaseDetails({ ...purchaseDetails, unitPrice: text })}
              keyboardType="numeric"
            />
            
            {purchaseDetails.quantity && purchaseDetails.unitPrice && (
              <Text className="text-sm text-gray-600 mb-4">
                Total Cost: ₹{(parseInt(purchaseDetails.quantity || '0') * parseFloat(purchaseDetails.unitPrice || '0')).toFixed(2)}
              </Text>
            )}
            
            <View className="flex-row space-x-3">
              <TouchableOpacity 
                onPress={() => setBuyModalVisible(false)}
                className="flex-1 bg-gray-200 rounded-lg py-3"
              >
                <Text className="text-gray-800 text-center font-medium">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={confirmPurchase}
                className="flex-1 bg-blue-600 rounded-lg py-3"
              >
                <Text className="text-white text-center font-medium">Purchase</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
