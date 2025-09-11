import { Ionicons } from '@expo/vector-icons';
import { Href, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
  const [purchasing, setPurchasing] = useState(false);

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

  const fetchCompanyProducts = useCallback(async () => {
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
  },[companyId]);

  useEffect(() => {
    if (companyId) {
      fetchCompanyDetails();
      fetchCompanyProducts();
    }
  }, [companyId, fetchCompanyDetails, fetchCompanyProducts]);

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

    const quantity = parseInt(purchaseDetails.quantity.trim());
    const unitPrice = parseFloat(purchaseDetails.unitPrice.trim());

    if (isNaN(quantity) || quantity <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity');
      return;
    }

    if (isNaN(unitPrice) || unitPrice <= 0) {
      Alert.alert('Error', 'Please enter a valid unit price');
      return;
    }

    console.log('Parsed values:', { 
      quantity, 
      unitPrice, 
      originalQuantity: purchaseDetails.quantity,
      quantityType: typeof quantity,
      unitPriceType: typeof unitPrice
    });

    setPurchasing(true);

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

      console.log('Starting purchase process...', {
        product: selectedProduct.name,
        quantity,
        unitPrice,
        retailerId: retailerData.id
      });

      // Calculate total amount for transactions
      const totalAmount = quantity * unitPrice;
      const disposalCost = selectedProduct.disposal_cost * quantity;

      // Check if product already exists in inventory
      const { data: existingInventory, error: checkError } = await supabase
        .from('retailer_inventory')
        .select('*')
        .eq('retailer_id', retailerData.id)
        .eq('company_product_id', selectedProduct.id)
        .eq('is_custom_product', false)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing inventory:', checkError);
        throw checkError;
      }

      let inventoryId: string;
      let finalQuantity: number;
      
      if (existingInventory) {
        // Update existing inventory
        console.log('Updating existing inventory:', existingInventory.id);
        console.log('Current quantity:', existingInventory.quantity);
        console.log('Adding quantity:', quantity);
        
        const currentQty = Number(existingInventory.quantity) || 0;
        finalQuantity = currentQty + quantity;
        console.log('Current quantity:', currentQty, 'Adding:', quantity, 'Final quantity will be:', finalQuantity);
        
        const { data: updatedInventory, error: updateError } = await supabase
          .from('retailer_inventory')
          .update({
            quantity: Number(finalQuantity), // Ensure it's a number
            unit_price: Number(unitPrice), // Ensure it's a number
            plastic_quantity_grams: Number(finalQuantity), // Ensure it's a number
            plastic_cost_per_gram: Number(selectedProduct.disposal_cost), // Ensure it's a number
            total_plastic_cost: Number(selectedProduct.disposal_cost * finalQuantity), // Ensure it's a number
            status: 'available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingInventory.id)
          .select()
          .single();

        if (updateError) {
          console.error('Update error:', updateError);
          throw updateError;
        }
        
        inventoryId = existingInventory.id;
        console.log('Successfully updated inventory:', updatedInventory);
      } else {
        // Create new inventory item
        console.log('Creating new inventory item');
        finalQuantity = quantity;
        
        // Validate quantity before insertion
        if (!quantity || quantity <= 0) {
          throw new Error(`Invalid quantity for insertion: ${quantity}`);
        }
        
        const inventoryData = {
          company_product_id: selectedProduct.id,
          retailer_id: retailerData.id,
          quantity: Number(quantity), // Ensure it's a number
          unit_price: Number(unitPrice), // Ensure it's a number
          status: 'available',
          plastic_quantity_grams: Number(quantity), // Ensure it's a number
          plastic_cost_per_gram: Number(selectedProduct.disposal_cost), // Ensure it's a number
          total_plastic_cost: Number(disposalCost), // Ensure it's a number
          is_custom_product: false,
          product_name: null,
          product_category: null,
          product_description: null,
        };
        
        console.log('Inventory data to insert:', inventoryData);
        console.log('Quantity value being inserted:', inventoryData.quantity, 'Type:', typeof inventoryData.quantity);
        
        const { data: newInventory, error: insertError } = await supabase
          .from('retailer_inventory')
          .insert(inventoryData)
          .select()
          .single();

        if (insertError) {
          console.error('Insert error:', insertError);
          throw insertError;
        }
        
        if (!newInventory) {
          throw new Error('No inventory data returned after insert');
        }
        
        inventoryId = newInventory.id;
        console.log('Successfully created inventory:', newInventory);
      }

      // Create a transaction record in the transactions table (retailer purchasing from company)
      // Note: This is a retailer purchase, not a consumer purchase, so plastic_disposal_fee should be 0
      // The disposal dues flow will be triggered when consumers buy from this retailer
      const { data: transactionRecord, error: transactionRecordError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id, // Retailer user
          inventory_id: inventoryId,
          cost_paid: totalAmount,
          plastic_disposal_fee: 0, // No disposal fee for retailer purchases from companies
          timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      if (transactionRecordError) {
        console.error('Transaction record creation failed:', transactionRecordError);
        throw transactionRecordError;
      }

      console.log('Transaction record created:', transactionRecord);

      // Note: We don't create inventory_transactions for retailer restocking
      // inventory_transactions are for business purchases from retailers
      // This is a retailer restocking from company, tracked via company_payments

      // Create company payment record for audit trail
      const { error: paymentError } = await supabase
        .from('company_payments')
        .insert({
          company_id: companyId as string,
          retailer_id: retailerData.id,
          amount: totalAmount,
          status: 'completed',
          timestamp: new Date().toISOString(),
        });

      if (paymentError) {
        console.error('Payment record creation failed:', paymentError);
      }

      // Create disposal due for retailer's obligation to company
      if (disposalCost > 0) {
        try {
          console.log('Creating disposal dues for retailer purchase from company...');
          
          const { createRetailerCompanyDisposalDue } = await import('../../lib/disposal-dues');
          
          const disposalDues = await createRetailerCompanyDisposalDue(
            retailerData.id,
            companyId as string,
            disposalCost,
            transactionRecord.id
          );

          console.log('Disposal dues created successfully:', disposalDues);

        } catch (disposalError) {
          console.error('Error in disposal due creation:', disposalError);
          // Don't fail the whole purchase for disposal due creation errors
          Alert.alert('Warning', 'Purchase completed but disposal due creation failed. Please contact support.');
        }
      }

      // Verify the inventory was created/updated correctly
      const { data: verifyInventory, error: verifyError } = await supabase
        .from('retailer_inventory')
        .select('*')
        .eq('id', inventoryId)
        .single();

      if (verifyError) {
        console.error('Error verifying inventory:', verifyError);
      } else {
        console.log('Verified inventory after purchase:', verifyInventory);
        if (verifyInventory.quantity !== finalQuantity) {
          console.error('WARNING: Quantity mismatch!', {
            expected: finalQuantity,
            actual: verifyInventory.quantity
          });
          Alert.alert('Warning', 'Inventory quantity may not be correct. Please check your inventory.');
        }
      }

      Alert.alert('Purchase Complete!', 
        `Successfully purchased ${purchaseDetails.quantity} units of ${selectedProduct.name}\n\n` +
        `Total Cost: ₹${totalAmount.toFixed(2)}\n` +
        `Disposal Cost: ₹${disposalCost.toFixed(2)}\n\n` +
        `Disposal dues have been created for proper waste management tracking.\n\n` +
        `Check your inventory to see the updated stock.`,
        [
          { 
            text: 'View Inventory', 
            onPress: () => {
              setBuyModalVisible(false);
              router.push('/retailer/products' as Href);
            }
          },
          { 
            text: 'OK', 
            onPress: () => setBuyModalVisible(false)
          }
        ]
      );
      
      setSelectedProduct(null);
      setPurchaseDetails({ quantity: '', unitPrice: '' });

    } catch (error) {
      console.error('Error purchasing product:', error);
      Alert.alert('Error', `Failed to purchase product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPurchasing(false);
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
              Disposal Cost: ₹{item.disposal_cost}/unit
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
        disabled={purchasing}
      >
        <Text className="text-white text-center font-semibold">
          {purchasing ? 'Processing...' : 'Purchase for Store'}
        </Text>
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
        onRequestClose={() => !purchasing && setBuyModalVisible(false)}
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
                Disposal Cost: ₹{selectedProduct?.disposal_cost}/unit
              </Text>
              {selectedProduct?.description && (
                <Text className="text-xs text-gray-500 mb-3">
                  {selectedProduct.description}
                </Text>
              )}
            </View>
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-3"
              placeholder="Quantity (grams for plastic materials)"
              value={purchaseDetails.quantity}
              onChangeText={(text) => {
                console.log('Quantity input changed to:', text);
                setPurchaseDetails({ ...purchaseDetails, quantity: text });
              }}
              keyboardType="numeric"
              editable={!purchasing}
            />
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Your selling price per unit (₹)"
              value={purchaseDetails.unitPrice}
              onChangeText={(text) => setPurchaseDetails({ ...purchaseDetails, unitPrice: text })}
              keyboardType="numeric"
              editable={!purchasing}
            />
            
            {purchaseDetails.quantity && purchaseDetails.unitPrice && (
              <View className="mb-4 p-3 bg-blue-50 rounded-lg">
                <Text className="text-sm text-blue-800 font-medium mb-1">Purchase Summary:</Text>
                <Text className="text-sm text-blue-700">
                  Quantity: {purchaseDetails.quantity} units
                </Text>
                <Text className="text-sm text-blue-700">
                  Total Cost: ₹{(parseInt(purchaseDetails.quantity || '0') * parseFloat(purchaseDetails.unitPrice || '0')).toFixed(2)}
                </Text>
                <Text className="text-sm text-blue-700">
                  Disposal Cost: ₹{(parseInt(purchaseDetails.quantity || '0') * (selectedProduct?.disposal_cost || 0)).toFixed(2)}
                </Text>
              </View>
            )}
            
            <View className="flex-row space-x-3">
              <TouchableOpacity 
                onPress={() => setBuyModalVisible(false)}
                className={`flex-1 py-3 rounded-lg ${purchasing ? 'bg-gray-200' : 'bg-gray-300'}`}
                disabled={purchasing}
              >
                <Text className="text-gray-700 text-center font-medium">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={confirmPurchase}
                className={`flex-1 py-3 rounded-lg ${purchasing ? 'bg-blue-400' : 'bg-blue-600'}`}
                disabled={purchasing}
              >
                {purchasing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white text-center font-medium">Purchase</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}