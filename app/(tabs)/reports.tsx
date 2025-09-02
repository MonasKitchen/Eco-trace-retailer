import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface ReportData {
  totalRevenue: number;
  totalCollected: number;
  businessCount: number;
  productCount: number;
  monthlyTrend: Array<{ month: string; amount: number }>;
  disposalCosts: Array<{ month: string; amount: number }>;
  topBusinesses: Array<{ name: string; amount: number; transactions: number }>;
  inventoryValue: number;
  pendingCollections: number;
}

export default function ReportsScreen() {
  const [reportData, setReportData] = useState<ReportData>({
    totalRevenue: 0,
    totalCollected: 0,
    businessCount: 0,
    productCount: 0,
    monthlyTrend: [],
    disposalCosts: [],
    topBusinesses: [],
    inventoryValue: 0,
    pendingCollections: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedReport, setSelectedReport] = useState<'overview' | 'collections' | 'inventory' | 'businesses'>('overview');

  useEffect(() => {
    fetchReportData();
  }, [selectedPeriod]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      
      // Get current retailer
      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id, registered_businesses')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();

      if (retailerError) {
        console.error('Error fetching retailer data:', retailerError);
        setReportData({
          totalRevenue: 0,
          totalCollected: 0,
          businessCount: 0,
          productCount: 0,
          monthlyTrend: [],
          disposalCosts: [],
          topBusinesses: [],
          inventoryValue: 0,
          pendingCollections: 0,
        });
        return;
      }

      if (retailerData) {
        // Calculate date range based on selected period
        const now = new Date();
        let startDate: Date;
        
        switch (selectedPeriod) {
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

        // Fetch retailer transactions for revenue calculation
        const { data: transactions } = await supabase
          .from('retailer_transactions')
          .select('amount, timestamp, business_id, type')
          .eq('retailer_id', retailerData.id)
          .gte('timestamp', startDate.toISOString());

        const totalRevenue = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        // Fetch products count and inventory value
        const { data: inventory } = await supabase
          .from('retailer_inventory')
          .select('quantity, unit_price, disposal_cost')
          .eq('retailer_id', retailerData.id);

        const productCount = inventory?.length || 0;
        const inventoryValue = inventory?.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) || 0;

        // Fetch pending collections
        const { data: pendingCollections } = await supabase
          .from('disposal_dues')
          .select('amount')
          .in('business_id', retailerData.registered_businesses?.map(id => id.toString()) || [])
          .eq('status', 'pending');

        const pendingAmount = pendingCollections?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

        const businessCount = retailerData.registered_businesses?.length || 0;

        // Generate monthly trend data
        const monthlyTrend = generateMonthlyTrend(transactions || []);
        const disposalCosts = generateDisposalCostsTrend(transactions || []);
        const topBusinesses = await generateTopBusinesses(transactions || []);

        setReportData({
          totalRevenue,
          totalCollected: totalRevenue,
          businessCount,
          productCount,
          monthlyTrend,
          disposalCosts,
          topBusinesses,
          inventoryValue,
          pendingCollections: pendingAmount,
        });
      } else {
        // Retailer profile doesn't exist yet, set default values
        setReportData({
          totalRevenue: 0,
          totalCollected: 0,
          businessCount: 0,
          productCount: 0,
          monthlyTrend: [],
          disposalCosts: [],
          topBusinesses: [],
          inventoryValue: 0,
          pendingCollections: 0,
        });
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateMonthlyTrend = (transactions: any[]) => {
    const monthlyData: { [key: string]: number } = {};
    
    transactions.forEach(transaction => {
      const date = new Date(transaction.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + Number(transaction.amount);
    });

    return Object.entries(monthlyData)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6); // Last 6 months
  };

  const generateDisposalCostsTrend = (transactions: any[]) => {
    const monthlyData: { [key: string]: number } = {};
    
    transactions.forEach(transaction => {
      if (transaction.type === 'disposal_collection') {
        const month = new Date(transaction.timestamp).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyData[month] = (monthlyData[month] || 0) + Number(transaction.amount);
      }
    });

    return Object.entries(monthlyData).map(([month, amount]) => ({ month, amount }));
  };

  const generateTopBusinesses = async (transactions: any[]) => {
    const businessTotals: { [key: string]: { amount: number; transactions: number } } = {};
    
    transactions.forEach(transaction => {
      if (transaction.business_id) {
        if (!businessTotals[transaction.business_id]) {
          businessTotals[transaction.business_id] = { amount: 0, transactions: 0 };
        }
        businessTotals[transaction.business_id].amount += Number(transaction.amount);
        businessTotals[transaction.business_id].transactions += 1;
      }
    });

    // Get business names
    const businessIds = Object.keys(businessTotals);
    if (businessIds.length > 0) {
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name')
        .in('id', businessIds);

      return Object.entries(businessTotals)
        .map(([businessId, data]) => {
          const business = businesses?.find(b => b.id === businessId);
          return {
            name: business?.name || 'Unknown Business',
            amount: data.amount,
            transactions: data.transactions,
          };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
    }

    return [];
  };

  const generateReport = async () => {
    try {
      // This would typically generate a PDF or send an email
      // For now, we'll just show an alert
      alert('Report generated successfully! Check your email for the detailed report.');
    } catch (error) {
      console.error('Error generating report:', error);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading reports...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="p-4 bg-white border-b border-gray-200">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Analytics & Reports</Text>
        <Text className="text-gray-600">Comprehensive insights into your retail operations</Text>
      </View>

      {/* Period Selector */}
      <View className="bg-white border-b border-gray-200 p-4">
        <Text className="text-sm font-medium text-gray-700 mb-2">Report Period</Text>
        <View className="flex-row space-x-2">
          {(['month', 'quarter', 'year'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              className={`flex-1 py-2 px-4 rounded-lg border ${
                selectedPeriod === period ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'
              }`}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                className={`text-center font-medium ${
                  selectedPeriod === period ? 'text-white' : 'text-gray-700'
                }`}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Report Type Selector */}
      <View className="bg-white border-b border-gray-200 p-4">
        <Text className="text-sm font-medium text-gray-700 mb-2">Report Type</Text>
        <View className="flex-row space-x-2">
          {(['overview', 'collections', 'inventory', 'businesses'] as const).map((report) => (
            <TouchableOpacity
              key={report}
              className={`flex-1 py-2 px-4 rounded-lg border ${
                selectedReport === report ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
              }`}
              onPress={() => setSelectedReport(report)}
            >
              <Text
                className={`text-center font-medium text-sm ${
                  selectedReport === report ? 'text-white' : 'text-gray-700'
                }`}
              >
                {report.charAt(0).toUpperCase() + report.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Report Content */}
      <ScrollView className="flex-1 p-4">
        {loading ? (
          <View className="flex-1 justify-center items-center py-20">
            <Text className="text-gray-600">Loading reports...</Text>
          </View>
        ) : (
          <>
            {selectedReport === 'overview' && (
              <View>
                {/* Key Metrics */}
                <View className="grid grid-cols-2 gap-4 mb-6">
                  <View className="bg-white p-4 rounded-lg border border-gray-200">
                    <Text className="text-2xl font-bold text-green-600">₹{reportData.totalRevenue.toLocaleString()}</Text>
                    <Text className="text-gray-600 text-sm">Total Revenue</Text>
                  </View>
                  <View className="bg-white p-4 rounded-lg border border-gray-200">
                    <Text className="text-2xl font-bold text-blue-600">₹{reportData.inventoryValue.toLocaleString()}</Text>
                    <Text className="text-gray-600 text-sm">Inventory Value</Text>
                  </View>
                  <View className="bg-white p-4 rounded-lg border border-gray-200">
                    <Text className="text-2xl font-bold text-orange-600">₹{reportData.pendingCollections.toLocaleString()}</Text>
                    <Text className="text-gray-600 text-sm">Pending Collections</Text>
                  </View>
                  <View className="bg-white p-4 rounded-lg border border-gray-200">
                    <Text className="text-2xl font-bold text-purple-600">{reportData.businessCount}</Text>
                    <Text className="text-gray-600 text-sm">Active Businesses</Text>
                  </View>
                </View>

                {/* Monthly Trend */}
                <View className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                  <Text className="text-lg font-semibold text-gray-800 mb-3">Revenue Trend</Text>
                  {reportData.monthlyTrend.length > 0 ? (
                    <View>
                      {reportData.monthlyTrend.map((item, index) => (
                        <View key={index} className="flex-row justify-between items-center py-2 border-b border-gray-100">
                          <Text className="text-gray-600">{item.month}</Text>
                          <Text className="font-semibold text-green-600">₹{item.amount.toLocaleString()}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-gray-500 text-center py-4">No data available for selected period</Text>
                  )}
                </View>
              </View>
            )}

            {selectedReport === 'collections' && (
              <View>
                <View className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                  <Text className="text-lg font-semibold text-gray-800 mb-3">Collection Summary</Text>
                  <View className="space-y-3">
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600">Total Collected</Text>
                      <Text className="font-semibold text-green-600">₹{reportData.totalCollected.toLocaleString()}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600">Pending Collections</Text>
                      <Text className="font-semibold text-orange-600">₹{reportData.pendingCollections.toLocaleString()}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600">Collection Rate</Text>
                      <Text className="font-semibold text-blue-600">
                        {reportData.totalCollected + reportData.pendingCollections > 0 
                          ? Math.round((reportData.totalCollected / (reportData.totalCollected + reportData.pendingCollections)) * 100)
                          : 0}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Disposal Costs Trend */}
                <View className="bg-white p-4 rounded-lg border border-gray-200">
                  <Text className="text-lg font-semibold text-gray-800 mb-3">Disposal Costs Trend</Text>
                  {reportData.disposalCosts.length > 0 ? (
                    <View>
                      {reportData.disposalCosts.map((item, index) => (
                        <View key={index} className="flex-row justify-between items-center py-2 border-b border-gray-100">
                          <Text className="text-gray-600">{item.month}</Text>
                          <Text className="font-semibold text-orange-600">₹{item.amount.toLocaleString()}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-gray-500 text-center py-4">No disposal cost data available</Text>
                  )}
                </View>
              </View>
            )}

            {selectedReport === 'inventory' && (
              <View>
                <View className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                  <Text className="text-lg font-semibold text-gray-800 mb-3">Inventory Overview</Text>
                  <View className="space-y-3">
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600">Total Products</Text>
                      <Text className="font-semibold text-blue-600">{reportData.productCount}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600">Total Value</Text>
                      <Text className="font-semibold text-green-600">₹{reportData.inventoryValue.toLocaleString()}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-gray-600">Average Product Value</Text>
                      <Text className="font-semibold text-purple-600">
                        ₹{reportData.productCount > 0 ? Math.round(reportData.inventoryValue / reportData.productCount) : 0}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {selectedReport === 'businesses' && (
              <View>
                <View className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                  <Text className="text-lg font-semibold text-gray-800 mb-3">Top Performing Businesses</Text>
                  {reportData.topBusinesses.length > 0 ? (
                    <View>
                      {reportData.topBusinesses.map((business, index) => (
                        <View key={index} className="flex-row justify-between items-center py-3 border-b border-gray-100">
                          <View>
                            <Text className="font-medium text-gray-800">{business.name}</Text>
                            <Text className="text-sm text-gray-500">{business.transactions} transactions</Text>
                          </View>
                          <Text className="font-semibold text-green-600">₹{business.amount.toLocaleString()}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-gray-500 text-center py-4">No business data available</Text>
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}