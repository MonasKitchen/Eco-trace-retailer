import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface ReportData {
  totalRevenue: number;
  totalCollected: number;
  businessCount: number;
  productCount: number;
  monthlyTrend: { month: string; amount: number }[];
  disposalCostsTrend: { month: string; amount: number }[];
  topBusinesses: { name: string; amount: number; transactions: number }[];
  inventoryValue: number;
  pendingCollections: number;
  inventoryMovements: { month: string; purchases: number; returns: number }[];
  companyPayments: { company: string; amount: number; status: string }[];
  environmentalImpact: {
    totalPlasticCollected: number;
    totalDisposalCosts: number;
    plasticReduction: number;
    environmentalScore: number;
  };
}

export default function ReportsScreen() {
  const [reportData, setReportData] = useState<ReportData>({
    totalRevenue: 0,
    totalCollected: 0,
    businessCount: 0,
    productCount: 0,
    monthlyTrend: [],
    disposalCostsTrend: [],
    topBusinesses: [],
    inventoryValue: 0,
    pendingCollections: 0,
    inventoryMovements: [],
    companyPayments: [],
    environmentalImpact: {
      totalPlasticCollected: 0,
      totalDisposalCosts: 0,
      plasticReduction: 0,
      environmentalScore: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedReport, setSelectedReport] = useState<'overview' | 'collections' | 'inventory' | 'businesses' | 'environmental'>('overview');

  // Helper functions moved outside of fetchReportData to prevent recreation
  const getDateRange = useCallback((period: 'month' | 'quarter' | 'year') => {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return { startDate, endDate: now };
  }, []);

  const fetchRetailerTransactions = useCallback(async (retailerId: string, startDate: Date, endDate: Date) => {
    try {
      const { data, error } = await supabase
        .from('retailer_transactions')
        .select('*')
        .eq('retailer_id', retailerId)
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching retailer transactions:', error);
      return [];
    }
  }, []);

  const fetchBusinessTransactions = useCallback(async (businessIds: string[], startDate: Date, endDate: Date) => {
    if (!businessIds || businessIds.length === 0) return [];
    
    try {
      const { data, error } = await supabase
        .from('business_transactions')
        .select(`
          *,
          businesses!inner(name),
          retailer_inventory(product_name, unit_price)
        `)
        .in('business_id', businessIds)
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching business transactions:', error);
      return [];
    }
  }, []);

  const fetchInventoryTransactions = useCallback(async (retailerId: string, startDate: Date, endDate: Date) => {
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select(`
          *,
          retailer_inventory!inner(
            retailer_id,
            product_name,
            product_category,
            plastic_quantity_grams,
            total_plastic_cost
          )
        `)
        .eq('retailer_inventory.retailer_id', retailerId)
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching inventory transactions:', error);
      return [];
    }
  }, []);

  const fetchRetailerInventory = useCallback(async (retailerId: string) => {
    try {
      const { data, error } = await supabase
        .from('retailer_inventory')
        .select('*')
        .eq('retailer_id', retailerId);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching retailer inventory:', error);
      return [];
    }
  }, []);

  const fetchDisposalDues = useCallback(async (retailerId: string, startDate: Date, endDate: Date) => {
    try {
      const { data, error } = await supabase
        .from('retailer_disposal_dues')
        .select(`
          *,
          business_disposal_dues!inner(
            *,
            consumer_disposal_dues!inner(*)
          )
        `)
        .eq('retailer_id', retailerId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching disposal dues:', error);
      return [];
    }
  }, []);

  const fetchCompanyPayments = useCallback(async (retailerId: string, startDate: Date, endDate: Date) => {
    try {
      const { data, error } = await supabase
        .from('company_payments')
        .select(`
          *,
          companies!inner(name)
        `)
        .eq('retailer_id', retailerId)
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching company payments:', error);
      return [];
    }
  }, []);

  const generateMonthlyTrend = useCallback((transactions: any[]) => {
    if (!transactions || transactions.length === 0) return [];
    
    const monthlyData: { [key: string]: number } = {};
    
    transactions.forEach(transaction => {
      if (transaction.timestamp && transaction.amount) {
        const date = new Date(transaction.timestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + Number(transaction.amount || 0);
      }
    });

    return Object.entries(monthlyData)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, []);

  const generateTopBusinesses = useCallback(async (transactions: any[], businessIds: string[], startDate?: Date, endDate?: Date) => {
    if (!transactions || transactions.length === 0 || !businessIds || businessIds.length === 0) {
      return [];
    }

    // Filter transactions by date if provided
    let filteredTransactions = transactions;
    if (startDate && endDate) {
      filteredTransactions = transactions.filter(t => {
        if (!t.timestamp) return false;
        const transactionDate = new Date(t.timestamp);
        return transactionDate >= startDate && transactionDate <= endDate;
      });
    }

    const businessTotals: { [key: string]: { amount: number; transactions: number } } = {};
    
    filteredTransactions.forEach((transaction: any) => {
      if (transaction.business_id && businessIds.includes(transaction.business_id)) {
        if (!businessTotals[transaction.business_id]) {
          businessTotals[transaction.business_id] = { amount: 0, transactions: 0 };
        }
        businessTotals[transaction.business_id].amount += Number(transaction.amount || 0);
        businessTotals[transaction.business_id].transactions += 1;
      }
    });

    if (Object.keys(businessTotals).length === 0) return [];

    try {
      const { data: businesses, error } = await supabase
        .from('businesses')
        .select('id, name')
        .in('id', Object.keys(businessTotals));

      if (error) throw error;

      return Object.entries(businessTotals)
        .map(([businessId, data]: [string, { amount: number; transactions: number }]) => {
          const business = businesses?.find((b: any) => b.id === businessId);
          return {
            name: business?.name || 'Unknown Business',
            amount: data.amount,
            transactions: data.transactions,
          };
        })
        .sort((a: any, b: any) => b.amount - a.amount)
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching business names:', error);
      return [];
    }
  }, []);

  const getEmptyReportData = useCallback((): ReportData => ({
    totalRevenue: 0,
    totalCollected: 0,
    businessCount: 0,
    productCount: 0,
    monthlyTrend: [],
    disposalCostsTrend: [],
    topBusinesses: [],
    inventoryValue: 0,
    pendingCollections: 0,
    inventoryMovements: [],
    companyPayments: [],
    environmentalImpact: {
      totalPlasticCollected: 0,
      totalDisposalCosts: 0,
      plasticReduction: 0,
      environmentalScore: 0,
    },
  }), []);

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get current user and retailer
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id, registered_businesses')
        .eq('user_id', user.id)
        .single();

      if (retailerError || !retailerData || !retailerData.id) {
        throw new Error('Retailer data not found');
      }

      // Calculate date range based on selected period
      const { startDate, endDate } = getDateRange(selectedPeriod);

      // Ensure registered_businesses is an array
      const businessIds = Array.isArray(retailerData.registered_businesses) 
        ? retailerData.registered_businesses.filter(id => id != null)
        : [];

      // Fetch data from correct schema tables
      const [
        retailerTransactions,
        inventoryTransactions,
        inventory,
        disposalDues,
        companyPayments
      ] = await Promise.all([
        fetchRetailerTransactions(retailerData.id, startDate, endDate),
        fetchInventoryTransactions(retailerData.id, startDate, endDate),
        fetchRetailerInventory(retailerData.id),
        fetchDisposalDues(retailerData.id, startDate, endDate),
        fetchCompanyPayments(retailerData.id, startDate, endDate)
      ]);

      // Calculate metrics from proper data sources with null checks
      const totalCollected = retailerTransactions?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;
      
      // Revenue = inventory sales (from inventory_transactions with type 'purchase')
      const totalRevenue = inventoryTransactions
        ?.filter(t => t.transaction_type === 'purchase')
        ?.reduce((sum, t) => sum + Number(t.total_amount || 0), 0) || 0;

      const businessCount = businessIds.length || 0;
      const productCount = inventory?.length || 0;
      const inventoryValue = inventory?.reduce((sum, item) => 
        sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0) || 0;
      
      const pendingCollections = disposalDues
        ?.filter(d => d.status === 'pending')
        ?.reduce((sum, d) => sum + Number(d.amount || 0), 0) || 0;

      // Generate trend data
      const monthlyTrend = generateMonthlyTrend(retailerTransactions);
      const topBusinesses = await generateTopBusinesses(retailerTransactions, businessIds, startDate, endDate);

      // Generate inventory movements with null checks
      const inventoryMovements = inventoryTransactions?.reduce((acc, transaction) => {
        if (!transaction.timestamp) return acc;
        
        const date = new Date(transaction.timestamp);
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        const existing = acc.find((item: { month: string; }) => item.month === monthKey);
        if (existing) {
          if (transaction.transaction_type === 'purchase') {
            existing.purchases += Number(transaction.quantity || 0);
          } else if (transaction.transaction_type === 'return') {
            existing.returns += Number(transaction.quantity || 0);
          }
        } else {
          acc.push({
            month: monthKey,
            purchases: transaction.transaction_type === 'purchase' ? Number(transaction.quantity || 0) : 0,
            returns: transaction.transaction_type === 'return' ? Number(transaction.quantity || 0) : 0,
          });
        }
        return acc;
      }, [] as { month: string; purchases: number; returns: number }[]) || [];

      // Company payments summary with null checks
      const companyPaymentsSummary = companyPayments?.reduce((acc, payment) => {
        const companyName = payment.companies?.name || 'Unknown Company';
        const existing = acc.find((item: { company: any; }) => item.company === companyName);
        if (existing) {
          existing.amount += Number(payment.amount || 0);
        } else {
          acc.push({
            company: companyName,
            amount: Number(payment.amount || 0),
            status: payment.status || 'unknown',
          });
        }
        return acc;
      }, [] as { company: string; amount: number; status: string }[]) || [];

      // Environmental impact calculation with null checks
      const totalPlasticCollected = inventory?.reduce((sum, item) => 
        sum + (Number(item.plastic_quantity_grams || 0) * Number(item.quantity || 0)), 0) || 0;
      
      const totalDisposalCosts = inventory?.reduce((sum, item) => 
        sum + Number(item.total_plastic_cost || 0), 0) || 0;

      const plasticFromTransactions = inventoryTransactions
        ?.filter(t => t.transaction_type === 'purchase')
        ?.reduce((sum, t) => sum + Number(t.plastic_quantity_purchased || 0), 0) || 0;

      const plasticReduction = plasticFromTransactions * 0.8;
      const environmentalScore = Math.min(100, Math.round(
        (plasticReduction / 1000) * 10 + (totalDisposalCosts / 100) * 5
      ));

      setReportData({
        totalRevenue,
        totalCollected,
        businessCount,
        productCount,
        monthlyTrend,
        disposalCostsTrend: [], // Can be implemented similar to monthlyTrend
        topBusinesses: topBusinesses as { name: string; amount: number; transactions: number; }[],
        inventoryValue,
        pendingCollections,
        inventoryMovements,
        companyPayments: companyPaymentsSummary,
        environmentalImpact: {
          totalPlasticCollected: totalPlasticCollected + plasticFromTransactions,
          totalDisposalCosts,
          plasticReduction,
          environmentalScore,
        },
      });

    } catch (error) {
      console.error('Error fetching report data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load report data');
      setReportData(getEmptyReportData());
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, getDateRange, fetchRetailerTransactions, fetchInventoryTransactions, fetchRetailerInventory, fetchDisposalDues, fetchCompanyPayments, generateMonthlyTrend, generateTopBusinesses, getEmptyReportData]);
  
  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const generateReport = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please log in to generate report');
        return;
      }

      const { data: retailerDataForReport, error: retailerError } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (retailerError || !retailerDataForReport?.id) {
        Alert.alert('Error', 'Retailer profile not found');
        return;
      }

      Alert.alert('Success', 'Report data prepared. Select a company to generate the full environmental report.');
    } catch (error) {
      console.error('Error generating report:', error);
      Alert.alert('Error', 'Error generating report. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ color: '#6b7280', marginTop: 10 }}>Loading reports...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', padding: 20 }}>
        <Text style={{ color: '#dc2626', textAlign: 'center', marginBottom: 20 }}>{error}</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#059669', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
          onPress={fetchReportData}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <View style={{ padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 }}>Analytics & Reports</Text>
        <Text style={{ color: '#6b7280' }}>Comprehensive insights into your retail operations</Text>
      </View>

      {/* Period Selector */}
      <View style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>Report Period</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['month', 'quarter', 'year'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: selectedPeriod === period ? '#059669' : 'white',
                borderColor: selectedPeriod === period ? '#059669' : '#d1d5db'
              }}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontWeight: '500',
                  color: selectedPeriod === period ? 'white' : '#374151'
                }}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Report Type Selector */}
      <View style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>Report Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['overview', 'collections', 'inventory', 'businesses', 'environmental'] as const).map((report) => (
              <TouchableOpacity
                key={report}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: selectedReport === report ? '#2563eb' : 'white',
                  borderColor: selectedReport === report ? '#2563eb' : '#d1d5db'
                }}
                onPress={() => setSelectedReport(report)}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontWeight: '500',
                    fontSize: 12,
                    color: selectedReport === report ? 'white' : '#374151'
                  }}
                >
                  {report.charAt(0).toUpperCase() + report.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Report Content */}
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {selectedReport === 'overview' && (
          <View>
            {/* Key Metrics */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#059669' }}>₹{reportData.totalRevenue.toLocaleString()}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 14 }}>Sales Revenue</Text>
                </View>
                <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2563eb' }}>₹{reportData.totalCollected.toLocaleString()}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 14 }}>Collections</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#ea580c' }}>₹{reportData.pendingCollections.toLocaleString()}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 14 }}>Pending Collections</Text>
                </View>
                <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#7c3aed' }}>{ reportData.businessCount}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 14 }}>Active Businesses</Text>
                </View>
              </View>
            </View>

            {/* Monthly Trend */}
            <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Collection Trend</Text>
              {reportData.monthlyTrend.length > 0 ? (
                <View>
                  {reportData.monthlyTrend.map((item, index) => (
                    <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                      <Text style={{ color: '#6b7280' }}>{item.month}</Text>
                      <Text style={{ fontWeight: '600', color: '#059669' }}>₹{item.amount.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 16 }}>No data available for selected period</Text>
              )}
            </View>

            {/* Top Businesses */}
            {reportData.topBusinesses.length > 0 && (
              <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Top Businesses</Text>
                {reportData.topBusinesses.map((business, index) => (
                  <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#1f2937', fontWeight: '500' }}>{business.name}</Text>
                      <Text style={{ color: '#9ca3af', fontSize: 12 }}>{business.transactions} transactions</Text>
                    </View>
                    <Text style={{ fontWeight: '600', color: '#059669' }}>₹{business.amount.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Company Payments Summary */}
            {reportData.companyPayments.length > 0 && (
              <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Company Payments</Text>
                {reportData.companyPayments.map((payment, index) => (
                  <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <Text style={{ color: '#1f2937' }}>{payment.company}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '600', color: '#059669', marginRight: 8 }}>₹{payment.amount.toLocaleString()}</Text>
                      <View style={{
                        backgroundColor: payment.status === 'completed' ? '#dcfce7' : payment.status === 'pending' ? '#fef3c7' : '#fee2e2',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4
                      }}>
                        <Text style={{
                          fontSize: 12,
                          color: payment.status === 'completed' ? '#166534' : payment.status === 'pending' ? '#92400e' : '#dc2626'
                        }}>
                          {payment.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {selectedReport === 'collections' && (
          <View>
            <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Collection Summary</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ color: '#6b7280' }}>Total Collected</Text>
                <Text style={{ fontWeight: '600', color: '#059669' }}>₹{reportData.totalCollected.toLocaleString()}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ color: '#6b7280' }}>Pending Collections</Text>
                <Text style={{ fontWeight: '600', color: '#ea580c' }}>₹{reportData.pendingCollections.toLocaleString()}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 8, paddingTop: 8 }}>
                <Text style={{ color: '#1f2937', fontWeight: '600' }}>Collection Rate</Text>
                <Text style={{ fontWeight: 'bold', color: '#2563eb' }}>
                  {reportData.totalCollected + reportData.pendingCollections > 0 
                    ? Math.round((reportData.totalCollected / (reportData.totalCollected + reportData.pendingCollections)) * 100)
                    : 0
                  }%
                </Text>
              </View>
            </View>
          </View>
        )}

        {selectedReport === 'inventory' && (
          <View>
            <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Inventory Overview</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ color: '#6b7280' }}>Total Products</Text>
                <Text style={{ fontWeight: '600', color: '#2563eb' }}>{reportData.productCount}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ color: '#6b7280' }}>Inventory Value</Text>
                <Text style={{ fontWeight: '600', color: '#059669' }}>₹{reportData.inventoryValue.toLocaleString()}</Text>
              </View>
            </View>

            <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Inventory Movements</Text>
              {reportData.inventoryMovements.length > 0 ? (
                reportData.inventoryMovements.map((movement, index) => (
                  <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <Text style={{ color: '#6b7280' }}>{movement.month}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      <Text style={{ color: '#059669', marginRight: 16 }}>+{movement.purchases}</Text>
                      <Text style={{ color: '#dc2626' }}>-{movement.returns}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 16 }}>No inventory movements in selected period</Text>
              )}
            </View>
          </View>
        )}

        {selectedReport === 'businesses' && (
          <View>
            <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Business Network</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ color: '#6b7280' }}>Registered Businesses</Text>
                <Text style={{ fontWeight: '600', color: '#2563eb' }}>{reportData.businessCount}</Text>
              </View>
            </View>

            {reportData.topBusinesses.length > 0 && (
              <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Business Performance</Text>
                {reportData.topBusinesses.map((business, index) => (
                  <View key={index} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#1f2937', fontWeight: '500' }}>{business.name}</Text>
                      <Text style={{ fontWeight: '600', color: '#059669' }}>₹{business.amount.toLocaleString()}</Text>
                    </View>
                    <Text style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>{business.transactions} transactions</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {selectedReport === 'environmental' && (
          <View>
            <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 }}>Environmental Impact</Text>
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <Text style={{ color: '#6b7280' }}>Plastic Collected</Text>
                  <Text style={{ fontWeight: '600', color: '#059669' }}>{(reportData.environmentalImpact.totalPlasticCollected / 1000).toFixed(2)} kg</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <Text style={{ color: '#6b7280' }}>Disposal Costs</Text>
                  <Text style={{ fontWeight: '600', color: '#dc2626' }}>₹{reportData.environmentalImpact.totalDisposalCosts.toLocaleString()}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <Text style={{ color: '#6b7280' }}>Plastic Reduction</Text>
                  <Text style={{ fontWeight: '600', color: '#2563eb' }}>{(reportData.environmentalImpact.plasticReduction / 1000).toFixed(2)} kg</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 }}>
                  <Text style={{ color: '#1f2937', fontWeight: '600' }}>Environmental Score</Text>
                  <Text style={{ fontWeight: 'bold', color: '#059669' }}>{reportData.environmentalImpact.environmentalScore}/100</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Generate Report Button */}
      <View style={{ padding: 16, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
        <TouchableOpacity
          style={{ backgroundColor: '#059669', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 }}
          onPress={generateReport}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>Generate Detailed Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}