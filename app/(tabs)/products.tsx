import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
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
  qr_code_url: any;
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
  inventory_id: string; // Add this to track the specific inventory item
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
    inventory_id: string; // Track which inventory item this refers to
  }[]>([]);
  
  const [newInventoryItem, setNewInventoryItem] = useState({
    product_name: '',
    product_category: '',
    product_description: '',
    quantity: '',
    unit_price: '',
  });
// Add these functions to your products.tsx file

// QR Code generation functions
const generateProductQRData = (inventoryItem: RetailerInventory) => {
  return {
    // Basic product info
    id: inventoryItem.id,
    name: inventoryItem.is_custom_product ? inventoryItem.product_name : inventoryItem.company_product?.name,
    description: inventoryItem.product_description || 'No description',
    
    // Pricing info (per unit)
    unit_price: inventoryItem.unit_price,
    plastic_disposal_cost: inventoryItem.total_plastic_cost, // Cost per unit
    
    // Product details
    category: inventoryItem.is_custom_product ? inventoryItem.product_category : inventoryItem.company_product?.category,
    plastic_weight_grams: inventoryItem.plastic_quantity_grams,
    
    // Meta info
    type: 'eco-trace-product',
    version: '1.0',
    created_at: new Date().toISOString(),
    retailer_id: inventoryItem.retailer_id
  };
};

const generateQRCodeURL = (data: object): string => {
  const qrData = JSON.stringify(data);
  const encodedData = encodeURIComponent(qrData);
  
  // Use GoQR.me API with eco styling
  const params = new URLSearchParams({
    data: encodedData,
    size: '400x400',
    format: 'png',
    ecc: 'M',
    margin: '10',
    bgcolor: 'ecfdf5', // Light green background
    color: '047857'     // Dark green color
  });
  
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
};

const generateQRForProduct = async (inventoryItem: RetailerInventory) => {
  try {
    const qrData = generateProductQRData(inventoryItem);
    const qrUrl = generateQRCodeURL(qrData);
    
    // Update the inventory item with QR code
    const { error } = await supabase
      .from('retailer_inventory')
      .update({
        qr_code_url: qrUrl,
        qr_data: JSON.stringify(qrData)
      })
      .eq('id', inventoryItem.id);
    
    if (error) throw error;
    
    return { qrUrl, qrData };
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
};

const regenerateQRCode = async (inventoryItem: RetailerInventory) => {
  try {
    setLoading(true);
    await generateQRForProduct(inventoryItem);
    await fetchInventory(); // Refresh the inventory list
    Alert.alert('Success', 'QR code generated successfully!');
  } catch (error: any) {
    Alert.alert('Error', 'Failed to generate QR code: ' + error.message);
  } finally {
    setLoading(false);
  }
};
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
  }, []);

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

    // FIXED: Get plastic materials from retailer's inventory with better error handling
    console.log('Fetching for retailer ID:', retailerData.id);

    const { data, error } = await supabase
      .from('retailer_inventory')
      .select(`
        id,
        quantity,
        company_product_id,
        is_custom_product,
        company_products (
          id,
          name,
          category,
          disposal_cost
        )
      `)
      .eq('retailer_id', retailerData.id)
      .eq('is_custom_product', false) // Only company products (plastic materials)
      .gt('quantity', 0); // Only materials with available stock

    if (error) {
      console.error('Error fetching plastic materials:', error);
      throw error;
    }
    
    // Log full query results for debugging
    console.log('Query results:', {
      totalResults: data?.length || 0,
      hasData: !!data,
      firstItem: data?.[0],
      retailerId: retailerData.id,
      filterConditions: {
        is_custom_product: false,
        quantity_gt_0: true
      }
    });
    
    // FIXED: Better data processing with null checks
    const materials: PlasticMaterial[] = (data || [])
      .filter(item => item.company_products) // Filter out items without company_products
      .map((item: any) => ({
        id: item.company_product_id, // Use company_product_id as the material ID
        name: item.company_products.name,
        category: item.company_products.category,
        disposal_cost: item.company_products.disposal_cost,
        quantity_available: item.quantity,
        inventory_id: item.id, // Store the inventory item ID for later updates
      }));
    
    console.log('Processed plastic materials:', materials);
    setPlasticMaterials(materials);
    
    // DEBUGGING: Add additional logging
    if (materials.length === 0) {
      console.log('No plastic materials found. Debugging info:');
      console.log('- Retailer ID:', retailerData.id);
      
      // Check if there are ANY inventory items for this retailer
      const { data: allInventory, error: debugError } = await supabase
        .from('retailer_inventory')
        .select('*, company_products(*)')
        .eq('retailer_id', retailerData.id);
        
      if (!debugError) {
        console.log('Detailed Inventory Analysis:');
        console.log('- Total inventory items:', allInventory?.length || 0);
        console.log('- Custom products:', allInventory?.filter(item => item.is_custom_product)?.length || 0);
        console.log('- Non-custom products:', allInventory?.filter(item => !item.is_custom_product)?.length || 0);
        console.log('- Items with company_product_id:', allInventory?.filter(item => item.company_product_id)?.length || 0);
        console.log('- Items with quantity > 0:', allInventory?.filter(item => item.quantity > 0)?.length || 0);
        
        // Additional debugging for non-custom products
        const nonCustomProducts = allInventory?.filter(item => !item.is_custom_product) || [];
        if (nonCustomProducts.length > 0) {
          console.log('\nNon-custom products details:');
          nonCustomProducts.forEach((item, index) => {
            console.log(`\nItem ${index + 1}:`);
            console.log('- ID:', item.id);
            console.log('- Quantity:', item.quantity);
            console.log('- Is Custom:', item.is_custom_product);
            console.log('- Company Product ID:', item.company_product_id);
            console.log('- Has Company Product Data:', !!item.company_products);
            if (item.company_products) {
              console.log('- Company Product Name:', item.company_products.name);
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error fetching plastic materials:', error);
  }
}, []);

  useEffect(() => {
    fetchInventory();
    fetchPlasticMaterials();
  }, [fetchInventory, fetchPlasticMaterials]);

  const getItemStatus = (quantity: number): 'available' | 'out_of_stock' | 'discontinued' => {
    if (quantity === 0) return 'out_of_stock';
    return 'available';
  };

  // Enhanced validation function to check plastic material availability
  const validatePlasticMaterialAvailability = (quantity: number): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    for (const material of selectedPlasticMaterials) {
      const gramsNeeded = parseFloat(material.grams_per_unit || '0') * quantity;
      const availableMaterial = plasticMaterials.find(p => p.id === material.material_id);
      
      if (!availableMaterial) {
        errors.push(`Material "${material.material_name}" not found in inventory`);
        continue;
      }
      
      if (gramsNeeded > availableMaterial.quantity_available) {
        errors.push(
          `Insufficient "${material.material_name}": Need ${gramsNeeded}g but only ${availableMaterial.quantity_available}g available`
        );
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const addInventoryItem = async () => {
    try {
      // Basic validation
      if (!newInventoryItem.product_name || !newInventoryItem.product_category || !newInventoryItem.quantity || !newInventoryItem.unit_price) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }
      
      if (selectedPlasticMaterials.length === 0) {
        Alert.alert('Error', 'Please select at least one plastic material');
        return;
      }

      const quantity = parseInt(newInventoryItem.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        Alert.alert('Error', 'Please enter a valid quantity');
        return;
      }

      // Enhanced plastic material availability check
      const validation = validatePlasticMaterialAvailability(quantity);
      if (!validation.isValid) {
        Alert.alert(
          'Insufficient Plastic Materials', 
          validation.errors.join('\n\n'),
          [
            { text: 'OK', style: 'default' },
            { 
              text: 'Buy More Materials', 
              onPress: () => {
                Alert.alert('Buy Plastic Materials', 'Go to Companies tab to purchase more plastic materials from verified companies.');
              }
            }
          ]
        );
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

      // Calculate total plastic cost
      const totalPlasticCostPerUnit = selectedPlasticMaterials.reduce((sum, material) => {
        return sum + (parseFloat(material.grams_per_unit) * material.disposal_cost_per_gram);
      }, 0);
      
      const totalPlasticGrams = selectedPlasticMaterials.reduce((sum, material) => {
        return sum + parseFloat(material.grams_per_unit);
      }, 0);

      // **NEW: First create a company_product entry for the custom product**
      const companyProductData = {
        name: newInventoryItem.product_name,
        category: newInventoryItem.product_category,
        disposal_cost: totalPlasticCostPerUnit / totalPlasticGrams, // Average disposal cost per gram
        retailer_id: retailerData.id, // Link to the retailer creating this custom product
        company_id: null, // This will be null for retailer-created custom products
      };

      const { data: companyProductResult, error: companyProductError } = await supabase
        .from('company_products')
        .insert(companyProductData)
        .select()
        .single();

      if (companyProductError) {
        console.error('Error creating company product:', companyProductError);
        throw companyProductError;
      }

      // **UPDATED: Now create custom product with company_product_id reference**
      const inventoryData = {
        company_product_id: companyProductResult.id, // **NEW: Reference the created company product**
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

      // Deduct plastic materials from inventory using the stored inventory_id
      for (const material of selectedPlasticMaterials) {
        const gramsUsed = parseFloat(material.grams_per_unit) * quantity;
        const plasticMaterial = plasticMaterials.find(p => p.id === material.material_id);
        
        if (!plasticMaterial) continue;

        const newQuantity = plasticMaterial.quantity_available - gramsUsed;
        
        await supabase
          .from('retailer_inventory')
          .update({
            quantity: Math.max(0, newQuantity),
            status: getItemStatus(newQuantity),
            updated_at: new Date().toISOString(),
          })
          .eq('id', plasticMaterial.inventory_id); // Use the stored inventory_id
      }

      Alert.alert('Success', 'Custom product created successfully! Plastic materials have been deducted from your inventory.');
      setModalVisible(false);
      resetForm();
      
      // Refresh data
      await Promise.all([
        fetchInventory(),
        fetchPlasticMaterials()
      ]);
    } catch (error) {
      console.error('Error adding inventory item:', error);
      Alert.alert('Error', 'Failed to add inventory item. Please try again.');
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
      inventory_id: '',
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
        inventory_id: material?.inventory_id || '',
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSelectedPlasticMaterials(updated);
  };

  const removePlasticMaterial = (index: number) => {
    setSelectedPlasticMaterials(selectedPlasticMaterials.filter((_, i) => i !== index));
  };

  // Real-time availability check when user changes quantity or material amounts
  const checkMaterialAvailability = () => {
    const quantity = parseInt(newInventoryItem.quantity || '0');
    if (quantity <= 0 || selectedPlasticMaterials.length === 0) return null;

    const validation = validatePlasticMaterialAvailability(quantity);
    return validation;
  };

  const materialAvailability = checkMaterialAvailability();

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

 // Updated renderInventoryItem function
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
        
        {item.product_description && (
          <Text className="text-sm text-gray-500 mb-1">
            {item.product_description}
          </Text>
        )}
        
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-sm font-medium text-green-700">
            Selling Price: ₹{item.unit_price}/unit
          </Text>
          <Text className="text-sm text-orange-600">
            Plastic Cost: ₹{item.total_plastic_cost.toFixed(2)}/unit
          </Text>
        </View>
        
        {item.plastic_quantity_grams > 0 && (
          <View className="bg-gray-50 p-2 rounded mb-2">
            <Text className="text-xs font-medium text-gray-700 mb-1">Plastic Info:</Text>
            <Text className="text-xs text-gray-600">
              • {item.plastic_quantity_grams}g plastic per unit • ₹{item.plastic_cost_per_gram}/g
            </Text>
          </View>
        )}
        
        <Text className="text-xs text-gray-500">
          Stock: {item.quantity} units • Total Value: ₹{(item.quantity * item.unit_price).toFixed(2)}
        </Text>
      </View>
      
      {/* QR Code Section */}
      <View className="ml-4 items-center">
        {item.qr_code_url ? (
          <View className="items-center">
            <Image
              source={{ uri: item.qr_code_url }}
              style={{ width: 80, height: 80 }}
              resizeMode="contain"
            />
            <TouchableOpacity
              onPress={() => regenerateQRCode(item)}
              disabled={loading}
              className="mt-1 px-2 py-1 bg-green-500 rounded"
            >
              <Text className="text-white text-xs">Regenerate</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="w-20 h-20 bg-gray-200 rounded items-center justify-center">
            <Text className="text-gray-500 text-xs text-center">No QR Code</Text>
            <TouchableOpacity
              onPress={() => regenerateQRCode(item)}
              disabled={loading}
              className="mt-1 px-2 py-1 bg-green-500 rounded"
            >
              <Text className="text-white text-xs">Generate QR</Text>
            </TouchableOpacity>
          </View>
        )}
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
              Alert.alert('Buy Plastic Materials', 'Go to Companies tab to purchase plastic materials from verified companies.');
            }}
          >
            <Text className="text-white text-center font-semibold">Buy Plastic Materials</Text>
          </TouchableOpacity>
        </View>

        {/* Available Plastic Materials Summary */}
        {plasticMaterials.length > 0 && (
          <View className="bg-blue-50 p-3 rounded-lg mb-4">
            <Text className="text-blue-800 font-semibold mb-2">Available Plastic Materials:</Text>
            {plasticMaterials.slice(0, 3).map((material) => (
              <Text key={material.id} className="text-blue-700 text-xs">
                • {material.name}: {material.quantity_available}g (₹{material.disposal_cost}/g)
              </Text>
            ))}
            {plasticMaterials.length > 3 && (
              <Text className="text-blue-600 text-xs mt-1">
                +{plasticMaterials.length - 3} more materials available
              </Text>
            )}
          </View>
        )}
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
            {plasticMaterials.length === 0 && (
              <TouchableOpacity
                className="bg-purple-600 py-3 px-6 rounded-lg mt-4"
                onPress={() => {
                  Alert.alert('Buy Plastic Materials', 'Go to Companies tab to purchase plastic materials from verified companies first.');
                }}
              >
                <Text className="text-white font-semibold">Buy Plastic Materials First</Text>
              </TouchableOpacity>
            )}
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
                disabled={plasticMaterials.length === 0}
              >
                <Text className="text-white text-center">
                  {plasticMaterials.length === 0 ? 'No Materials Available' : 'Add Plastic Material'}
                </Text>
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

            {/* Real-time availability check display */}
            {materialAvailability && !materialAvailability.isValid && (
              <View className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <Text className="text-red-800 font-semibold mb-2">⚠️ Material Shortage:</Text>
                {materialAvailability.errors.map((error, index) => (
                  <Text key={index} className="text-red-700 text-sm mb-1">• {error}</Text>
                ))}
              </View>
            )}

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
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
                className="flex-1 bg-gray-300 py-3 rounded-lg"
              >
                <Text className="text-gray-700 font-semibold text-center">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addInventoryItem}
                className={`flex-1 py-3 rounded-lg ${
                  materialAvailability && !materialAvailability.isValid 
                    ? 'bg-gray-400' 
                    : 'bg-green-500'
                }`}
                disabled={materialAvailability !== null && !materialAvailability.isValid}
              >
                <Text className="text-white font-semibold text-center">
                  {(materialAvailability !== null && !materialAvailability.isValid) ? 'Insufficient Materials' : 'Create Product'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}