import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Company {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone_number: string;
  verification_status: string;
  disposal_rates: any;
  created_at: string;
}

export default function CompaniesScreen() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.log('CompaniesScreen rendering...'); // Debug log

  useEffect(() => {
    console.log('CompaniesScreen useEffect triggered'); // Debug log
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching companies from database...'); // Debug log
      
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .eq('verification_status', 'approved')
        .order('name');

      if (fetchError) {
        console.error('Error fetching companies:', fetchError);
        setError('Failed to fetch companies');
        return;
      }

      console.log('Companies fetched successfully:', data?.length || 0, 'companies'); // Debug log
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      setError('Failed to fetch companies');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCompanies();
  };

  const handleCompanyPress = (company: Company) => {
    console.log('Company pressed:', company.name); // Debug log
    router.push({
      pathname: '/(tabs)/company-products',
      params: { 
        companyId: company.id,
        companyName: company.name 
      }
    });
  };



  const renderCompanyItem = ({ item }: { item: Company }) => (
    <TouchableOpacity
      className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-100"
      onPress={() => handleCompanyPress(item)}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800 mb-1">
            {item.name}
          </Text>
          <Text className="text-sm text-gray-600 mb-2">
            Contact: {item.contact_person}
          </Text>
          <Text className="text-sm text-gray-500">
            {item.email}
          </Text>
          {item.phone_number && (
            <Text className="text-sm text-gray-500">
              {item.phone_number}
            </Text>
          )}
        </View>
        <View className="items-end">
          <View className="bg-green-100 px-2 py-1 rounded-full mb-2">
            <Text className="text-xs text-green-800 font-medium">
              Approved
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    console.log('CompaniesScreen showing loading state'); // Debug log
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#16a34a" />
        <Text className="text-gray-600">Loading companies...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 px-4">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-red-600 text-center mt-4 text-lg font-medium">{error}</Text>
        <TouchableOpacity 
          onPress={fetchCompanies}
          className="bg-green-600 rounded-lg px-6 py-3 mt-4"
        >
          <Text className="text-white font-medium">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  console.log('CompaniesScreen rendering main content with', companies.length, 'companies'); // Debug log

  return (
    <View className="flex-1 bg-gray-50">
      <View className="p-4">


        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-bold text-gray-800">
            Plastic Companies ({companies.length})
          </Text>
          <TouchableOpacity onPress={onRefresh} className="p-2">
            <Ionicons name="refresh" size={24} color="#16a34a" />
          </TouchableOpacity>
        </View>

        {companies.length === 0 ? (
          <View className="bg-white rounded-lg p-8 items-center">
            <Ionicons name="storefront-outline" size={48} color="#9ca3af" />
            <Text className="text-gray-500 text-center mt-4 text-lg font-medium">
              No companies available
            </Text>
            <Text className="text-gray-400 text-center mt-2">
              Check back later for verified plastic companies
            </Text>
          </View>
        ) : (
          <FlatList
            data={companies}
            renderItem={renderCompanyItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}
      </View>
    </View>
  );
}