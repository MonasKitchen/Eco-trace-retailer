import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

interface Company {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone_number: string;
  address: string;
  disposal_rates: any;
  verification_status: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  disposal_cost: number;
  qr_code_url: string;
  created_at: string;
}

export default function CompanyDetailsScreen() {
  const { companyId, companyName } = useLocalSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  console.log('CompanyDetailsScreen - Received params:', { companyId, companyName });

  useEffect(() => {
    console.log('CompanyDetailsScreen - useEffect triggered with companyId:', companyId);
    if (companyId) {
      fetchCompanyDetails();
      fetchCompanyProducts();
    } else {
      console.log('CompanyDetailsScreen - No companyId provided');
    }
  }, [companyId]);

  const fetchCompanyDetails = async () => {
    try {
      console.log('Fetching company details for ID:', companyId);
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) throw error;
      console.log('Company details fetched:', data?.name);
      setCompany(data);
    } catch (error) {
      console.error('Error fetching company details:', error);
      Alert.alert('Error', 'Failed to fetch company details');
    }
  };

  const fetchCompanyProducts = async () => {
    try {
      console.log('Fetching products for company ID:', companyId);
      const { data, error } = await supabase
        .from('company_products')
        .select('*')
        .eq('company_id', companyId)
        .order('name');

      if (error) {
        console.error('Error fetching products:', error);
        throw error;
      }
      
      console.log('Products fetched:', data?.length || 0, 'products');
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

  const renderProductItem = ({ item }: { item: Product }) => (
    <View className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800 mb-1">
            {item.name}
          </Text>
          <Text className="text-sm text-gray-600 mb-2">
            Category: {item.category}
          </Text>
          <Text className="text-lg font-bold text-green-600">
            ₹{item.disposal_cost}/unit
          </Text>
        </View>
        <View className="items-end">
          <TouchableOpacity className="bg-blue-100 px-3 py-1 rounded-full">
            <Text className="text-xs text-blue-800 font-medium">
              View QR
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#16a34a" />
        <Text className="mt-2 text-gray-600">Loading company details...</Text>
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
            {companyName || company?.name}
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
            <View>
              {/* Debug Section */}
              <TouchableOpacity 
                className="bg-purple-500 rounded-lg p-3 mb-4"
                onPress={async () => {
                  try {
                    const { data: allProducts } = await supabase
                      .from('company_products')
                      .select('*');
                    console.log('All products:', allProducts);
                    console.log('Looking for company_id:', companyId);
                    const matchingProducts = allProducts?.filter(p => p.company_id === companyId);
                    console.log('Matching products:', matchingProducts);
                    Alert.alert('Debug', `Total products: ${allProducts?.length || 0}\nMatching products: ${matchingProducts?.length || 0}`);
                  } catch (error) {
                    console.error('Debug error:', error);
                  }
                }}
              >
                <Text className="text-white text-center font-medium">Debug Products for this Company</Text>
              </TouchableOpacity>

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
                  
                  {company.address && (
                    <View>
                      <Text className="text-sm text-gray-500">Address</Text>
                      <Text className="text-base text-gray-800">{company.address}</Text>
                    </View>
                  )}
                  
                  <View className="flex-row items-center">
                    <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                    <Text className="text-sm text-green-600 ml-1 font-medium">
                      Verified Company
                    </Text>
                  </View>
                </View>
              </View>
              
              <View className="mb-3">
                <Text className="text-lg font-semibold text-gray-800">
                  Products ({products.length})
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center py-8">
            <Ionicons name="cube-outline" size={64} color="#9ca3af" />
            <Text className="text-gray-500 text-lg mt-4">No products found</Text>
            <Text className="text-gray-400 text-sm mt-2">
              This company hasn't added any products yet
            </Text>
            <Text className="text-gray-400 text-xs mt-2">
              Company ID: {companyId}
            </Text>
          </View>
        }
      />
    </View>
  );
}