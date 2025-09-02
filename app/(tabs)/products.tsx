import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface CompanyProduct {
  id: string;
  name: string;
  category: string;
  disposal_cost: number;
  company_id: string;
  company_name?: string;
  created_at: string;
}

interface RetailerInventory {
  id: string;
  company_product_id?: string;
  retailer_id: string;
  quantity: number;
  unit_price: number;
  status: 'available' | 'out_of_stock' | 'discontinued';
  plastic_quantity_grams: number;
  plastic_cost_per_gram: number;
  total_plastic_cost: number;
  product_name?: string;
  product_category?: string;
  product_description?: string;
  is_custom_product: boolean;
  company_product?: CompanyProduct;
  created_at: string;
}

interface PlasticMaterial {
  id: string;
  name: string;
  category: string;
  disposal_cost: number;
  quantity_available: number;
}

export default function ProductManagementScreen() {
  const [inventory, setInventory] = useState<RetailerInventory[]>([]);
  const [plasticMaterials, setPlasticMaterials] = useState<PlasticMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPlasticMaterials, setSelectedPlasticMaterials] = useState<{
    material_id: string;
    material_name: string;
    grams_per_unit: string;
    disposal_cost_per_gram: number;
  }[]>([]);
  
  const [newInventoryItem, setNewInventoryItem] = useState({
    product_name: '',
    product_category: '',
    product_description: '',
    quantity: '',
    unit_price: '',
  });

  // Memoized inventory stats calculation to prevent unnecessary re-renders
  const inventoryStats = useMemo(() => {
    const totalProducts = inventory.length;
    const totalValue = inventory.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const totalPlasticCost = inventory.reduce((sum, item) => sum + item.total_plastic_cost, 0);
    const lowStockItems = inventory.filter(item => item.quantity <= 10).length;

    return {
      totalProducts,
      totalValue,
      totalPlasticCost,
      lowStockItems,
    };
  }, [inventory]);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (retailerError) {
        console.error('Error fetching retailer data:', retailerError);
        setError('Failed to fetch retailer data');
        setInventory([]);
        setLoading(false);
        return;
      }

      if (retailerData) {
        const { data: inventoryData, error } = await supabase
          .from('retailer_inventory')
          .select(`
            *,
            company_product:company_products(*)
          `)
          .eq('retailer_id', retailerData.id)
          .eq('is_custom_product', true) // Only show custom products in main inventory
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const data = inventoryData || [];
        setInventory(data);
      } else {
        setInventory([]);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      setError('Failed to fetch inventory');
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependency array since it doesn't depend on any props/state

  const fetchPlasticMaterials = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;
      
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (retailerError || !retailerData) return;

      // Get plastic materials from retailer's inventory (purchased from companies)
      const { data, error } = await supabase
        .from('retailer_inventory')
        .select(`
          id,
          quantity,
          company_product:company_products!inner(
            id,
            name,
            category,
            disposal_cost
          )
        `)
        .eq('retailer_id', retailerData.id)
        .eq('is_custom_product', false) // Only company products (plastic materials)
        .gt('quantity', 0); // Only materials with available stock

      if (error) throw error;
      
      const materials: PlasticMaterial[] = (data || []).map((item: any) => ({
        id: item.company_product.id,
        name: item.company_product.name,
        category: item.company_product.category,
        disposal_cost: item.company_product.disposal_cost,
        quantity_available: item.quantity,
      }));
      
      setPlasticMaterials(materials);
    } catch (error) {
      console.error('Error fetching plastic materials:', error);
    }
  }, []); // Empty dependency array

  useEffect(() => {
    fetchInventory();
    fetchPlasticMaterials();
  }, []); // Removed fetchInventory from dependencies to prevent infinite loop

  const getItemStatus = (quantity: number): 'available' | 'out_of_stock' | 'discontinued' => {
    if (quantity === 0) return 'out_of_stock';
    return 'available';
  };

  const addInventoryItem = async () => {
    try {
      // Validation
      if (!newInventoryItem.product_name || !newInventoryItem.product_category || !newInventoryItem.quantity || !newInventoryItem.unit_price) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }
      
      if (selectedPlasticMaterials.length === 0) {
        Alert.alert('Error', 'Please select at least one plastic material');
        return;
      }

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

      if (retailerError) throw retailerError;

      const quantity = parseInt(newInventoryItem.quantity);
      
      // Check if we have enough plastic materials
      for (const material of selectedPlasticMaterials) {
        const gramsNeeded = parseFloat(material.grams_per_unit) * quantity;
        const availableMaterial = plasticMaterials.find(p => p.id === material.material_id);
        
        if (!availableMaterial || gramsNeeded > availableMaterial.quantity_available) {
          Alert.alert(
            'Insufficient Material', 
            `You need ${gramsNeeded}g of ${material.material_name} but only have ${availableMaterial?.quantity_available || 0}g available.`
          );
          return;
        }
      }

      // Calculate total plastic cost
      const totalPlasticCostPerUnit = selectedPlasticMaterials.reduce((sum, material) => {
        return sum + (parseFloat(material.grams_per_unit) * material.disposal_cost_per_gram);
      }, 0);
      
      const totalPlasticGrams = selectedPlasticMaterials.reduce((sum, material) => {
        return sum + parseFloat(material.grams_per_unit);
      }, 0);

      // Create custom product
      const inventoryData = {
        retailer_id: retailerData.id,
        product_name: newInventoryItem.product_name,
        product_category: newInventoryItem.product_category,
        product_description: newInventoryItem.product_description || null,
        quantity: quantity,
        unit_price: parseFloat(newInventoryItem.unit_price),
        status: getItemStatus(quantity),
        plastic_quantity_grams: totalPlasticGrams,
        plastic_cost_per_gram: totalPlasticCostPerUnit / totalPlasticGrams,
        total_plastic_cost: totalPlasticCostPerUnit,
        is_custom_product: true,
      };
      
      const { error: insertError } = await supabase
        .from('retailer_inventory')
        .insert(inventoryData);

      if (insertError) throw insertError;

      // Deduct plastic materials from inventory
      for (const material of selectedPlasticMaterials) {
        const gramsUsed = parseFloat(material.grams_per_unit) * quantity;
        
        // Find the plastic material inventory item
        const { data: plasticInventory, error: findError } = await supabase
          .from('retailer_inventory')
          .select('id, quantity')
          .eq('retailer_id', retailerData.id)
          .eq('company_product_id', material.material_id)
          .eq('is_custom_product', false)
          .single();

        if (findError || !plasticInventory) continue;

        const newQuantity = plasticInventory.quantity - gramsUsed;
        
        await supabase
          .from('retailer_inventory')
          .update({
            quantity: Math.max(0, newQuantity),
            status: getItemStatus(newQuantity),
            updated_at: new Date().toISOString(),
          })
          .eq('id', plasticInventory.id);
      }

      Alert.alert('Success', 'Custom product created successfully! Plastic materials have been deducted from your inventory.');
      setModalVisible(false);
      resetForm();
      
      // Use the callbacks to refresh data
      await Promise.all([
        fetchInventory(),
        fetchPlasticMaterials()
      ]);
    } catch (error) {
      console.error('Error adding inventory item:', error);
      Alert.alert('Error', 'Failed to add inventory item');
    }
  };

  const resetForm = () => {
    setNewInventoryItem({
      product_name: '',
      product_category: '',
      product_description: '',
      quantity: '',
      unit_price: '',
    });
    setSelectedPlasticMaterials([]);
  };

  const addPlasticMaterial = () => {
    setSelectedPlasticMaterials([...selectedPlasticMaterials, {
      material_id: '',
      material_name: '',
      grams_per_unit: '',
      disposal_cost_per_gram: 0,
    }]);
  };

  const updatePlasticMaterial = (index: number, field: string, value: string) => {
    const updated = [...selectedPlasticMaterials];
    if (field === 'material_id') {
      const material = plasticMaterials.find(m => m.id === value);
      updated[index] = {
        ...updated[index],
        material_id: value,
        material_name: material?.name || '',
        disposal_cost_per_gram: material?.disposal_cost || 0,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSelectedPlasticMaterials(updated);
  };

  const removePlasticMaterial = (index: number) => {
    setSelectedPlasticMaterials(selectedPlasticMaterials.filter((_, i) => i !== index));
  };

  const updateInventoryQuantity = useCallback(async (itemId: string, newQuantity: number) => {
    try {
      const { error } = await supabase
        .from('retailer_inventory')
        .update({
          quantity: newQuantity,
          status: getItemStatus(newQuantity),
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;
      await fetchInventory();
    } catch (error) {
      console.error('Error updating quantity:', error);
      Alert.alert('Error', 'Failed to update quantity');
    }
  }, [fetchInventory]);

  const renderInventoryItem = ({ item }: { item: RetailerInventory }) => (
    <View className="bg-white p-4 rounded-lg mb-3 shadow-sm border-l-4 border-blue-500">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800">
            {item.is_custom_product ? item.product_name : item.company_product?.name}
          </Text>
          
          <Text className="text-sm text-gray-600 mb-1">
            Category: {item.is_custom_product ? item.product_category : item.company_product?.category}
          </Text>
          
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm font-medium text-green-700">
              Selling Price: ₹{item.unit_price}/unit
            </Text>
            <Text className="text-sm text-orange-600">
              Plastic Cost: ₹{item.total_plastic_cost.toFixed(2)}
            </Text>
          </View>
          
          {item.plastic_quantity_grams > 0 && (
            <View className="bg-gray-50 p-2 rounded mb-2">
              <Text className="text-xs font-medium text-gray-700 mb-1">Plastic Info:</Text>
              <Text className="text-xs text-gray-600">
                • {item.plastic_quantity_grams}g total plastic • ₹{item.plastic_cost_per_gram}/g
              </Text>
            </View>
          )}
          
          <Text className="text-xs text-gray-500">
            Stock: {item.quantity} units • Total Value: ₹{(item.quantity * item.unit_price).toFixed(2)}
          </Text>
        </View>
        
        <View className="items-end">
          <View className={`flex-row items-center px-2 py-1 rounded-full ${
            item.status === 'available' ? 'bg-green-100' : 
            item.status === 'out_of_stock' ? 'bg-red-100' : 'bg-gray-100'
          }`}>
            <Text className={`text-xs font-medium ${
              item.status === 'available' ? 'text-green-800' : 
              item.status === 'out_of_stock' ? 'text-red-800' : 'text-gray-800'
            }`}>
              {item.status === 'available' ? 'Available' : 
               item.status === 'out_of_stock' ? 'Out of Stock' : 'Discontinued'}
            </Text>
          </View>
        </View>
      </View>
      
      <View className="flex-row justify-between items-center mt-3">
        <Text className="text-lg font-semibold text-blue-600">
          Stock: {item.quantity}
        </Text>
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={() => updateInventoryQuantity(item.id, item.quantity + 1)}
            className="bg-blue-500 px-3 py-1 rounded"
          >
            <Text className="text-white font-semibold">+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => updateInventoryQuantity(item.id, Math.max(0, item.quantity - 1))}
            className="bg-red-500 px-3 py-1 rounded"
          >
            <Text className="text-white font-semibold">-</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-lg text-gray-600">Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Stats Header */}
      <View className="p-4 bg-white border-b border-gray-200">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Store Inventory</Text>
        
        <View className="flex-row space-x-2 mb-4">
          <View className="flex-1 bg-green-50 p-3 rounded-lg">
            <Text className="text-green-800 font-semibold">{inventoryStats.totalProducts}</Text>
            <Text className="text-green-600 text-xs">Products</Text>
          </View>
          <View className="flex-1 bg-blue-50 p-3 rounded-lg">
            <Text className="text-blue-800 font-semibold">₹{inventoryStats.totalValue.toLocaleString()}</Text>
            <Text className="text-blue-600 text-xs">Value</Text>
          </View>
          <View className="flex-1 bg-orange-50 p-3 rounded-lg">
            <Text className="text-orange-800 font-semibold">₹{inventoryStats.totalPlasticCost.toFixed(0)}</Text>
            <Text className="text-orange-600 text-xs">Plastic Cost</Text>
          </View>
        </View>

        <View className="flex-row space-x-2 mb-4">
          <TouchableOpacity
            className="flex-1 bg-green-600 py-3 px-4 rounded-lg"
            onPress={() => setModalVisible(true)}
          >
            <Text className="text-white text-center font-semibold">Create Custom Product</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            className="flex-1 bg-purple-600 py-3 px-4 rounded-lg"
            onPress={() => {
              // Navigate to companies screen to buy plastic materials
              Alert.alert('Buy Plastic Materials', 'Go to Companies tab to purchase plastic materials from verified companies.');
            }}
          >
            <Text className="text-white text-center font-semibold">Buy Plastic Materials</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Product Inventory */}
      <FlatList
        data={inventory}
        keyExtractor={(item) => item.id}
        renderItem={renderInventoryItem}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center p-4">
            <Text className="text-xl font-semibold text-gray-800 mt-4">No Products</Text>
            <Text className="text-gray-600 text-center mt-2">
              Create your first product using plastic materials
            </Text>
          </View>
        }
      />

      {/* Custom Product Creation Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black bg-opacity-50">
          <View className="bg-white p-6 rounded-lg w-11/12 max-h-5/6">
            <Text className="text-xl font-bold text-gray-800 mb-4">Create Custom Product</Text>
            
            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Product Name *</Text>
              <TextInput
                value={newInventoryItem.product_name}
                onChangeText={(text) => setNewInventoryItem({...newInventoryItem, product_name: text})}
                placeholder="e.g., Custom Snack Pack"
                className="border border-gray-300 rounded-lg p-3"
              />
            </View>

            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Category *</Text>
              <TextInput
                value={newInventoryItem.product_category}
                onChangeText={(text) => setNewInventoryItem({...newInventoryItem, product_category: text})}
                placeholder="e.g., Snacks, Beverages"
                className="border border-gray-300 rounded-lg p-3"
              />
            </View>

            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Plastic Materials Used *</Text>
              {selectedPlasticMaterials.map((material, index) => (
                <View key={index} className="border border-gray-300 rounded-lg p-3 mb-2">
                  <View className="mb-2">
                    <Text className="text-sm text-gray-600 mb-1">Select Material</Text>
                    <View className="border border-gray-200 rounded">
                      {plasticMaterials.map((plastic) => (
                        <TouchableOpacity
                          key={plastic.id}
                          onPress={() => updatePlasticMaterial(index, 'material_id', plastic.id)}
                          className={`p-2 ${material.material_id === plastic.id ? 'bg-blue-50' : ''}`}
                        >
                          <Text className={material.material_id === plastic.id ? 'text-blue-800 font-medium' : 'text-gray-800'}>
                            {plastic.name} (Available: {plastic.quantity_available}g)
                          </Text>
                          <Text className="text-xs text-gray-500">₹{plastic.disposal_cost}/g</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  
                  <TextInput
                    placeholder="Grams per unit"
                    value={material.grams_per_unit}
                    onChangeText={(text) => updatePlasticMaterial(index, 'grams_per_unit', text)}
                    keyboardType="numeric"
                    className="border border-gray-200 rounded p-2 mb-2"
                  />
                  
                  {material.disposal_cost_per_gram > 0 && material.grams_per_unit && (
                    <Text className="text-xs text-orange-600">
                      Cost per unit: ₹{(parseFloat(material.grams_per_unit) * material.disposal_cost_per_gram).toFixed(2)}
                    </Text>
                  )}
                  
                  <TouchableOpacity
                    onPress={() => removePlasticMaterial(index)}
                    className="bg-red-500 p-1 rounded mt-2"
                  >
                    <Text className="text-white text-center text-xs">Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
              
              <TouchableOpacity
                onPress={addPlasticMaterial}
                className="bg-purple-500 p-2 rounded"
              >
                <Text className="text-white text-center">Add Plastic Material</Text>
              </TouchableOpacity>
            </View>

            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Quantity *</Text>
              <TextInput
                value={newInventoryItem.quantity}
                onChangeText={(text) => setNewInventoryItem({...newInventoryItem, quantity: text})}
                placeholder="Units to produce"
                keyboardType="numeric"
                className="border border-gray-300 rounded-lg p-3"
              />
            </View>

            <View className="mb-6">
              <Text className="text-gray-700 font-medium mb-2">Selling Price (₹ per unit) *</Text>
              <TextInput
                value={newInventoryItem.unit_price}
                onChangeText={(text) => setNewInventoryItem({...newInventoryItem, unit_price: text})}
                placeholder="Your selling price"
                keyboardType="numeric"
                className="border border-gray-300 rounded-lg p-3"
              />
              
              {selectedPlasticMaterials.length > 0 && (
                <View className="mt-2 p-2 bg-orange-50 rounded">
                  <Text className="text-sm text-orange-800 font-medium">Total Plastic Disposal Cost per Unit:</Text>
                  <Text className="text-lg text-orange-700 font-bold">
                    ₹{selectedPlasticMaterials.reduce((sum, material) => {
                      const grams = parseFloat(material.grams_per_unit) || 0;
                      const costPerGram = material.disposal_cost_per_gram || 0;
                      return sum + (grams * costPerGram);
                    }, 0).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            <View className="flex-row space-x-3">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="flex-1 bg-gray-300 py-3 rounded-lg"
              >
                <Text className="text-gray-700 font-semibold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addInventoryItem}
                className="flex-1 bg-green-500 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold text-center">Create Product</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}