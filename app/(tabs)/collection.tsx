import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface DisposalDue {
  business_disposal_due: any;
  business_disposal_due_id: any;
  id: string;
  business_id: string;
  amount: number;
  due_date: string;
  status: string;
  business: {
    name: string;
    type: string;
  };
  created_at: string;
}

interface RetailerDisposalDue {
  id: string;
  retailer_id: string;
  business_disposal_due_id: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  business_disposal_due?: {
    business_id: string;
    business?: {
      name: string;
      type: string;
    }
  };
}

interface RetailerTransaction {
  id: string;
  retailer_id: string;
  business_id: string;
  amount: number;
  timestamp: string;
  business?: {
    name: string;
    type: string;
  };
}

interface CompanyPayment {
  id: string;
  company_id: string;
  retailer_id: string;
  amount: number;
  timestamp: string;
  status: string;
  company?: {
    name: string;
  };
}

interface CompanySummary {
  company_id: string;
  company_name: string;
  total_owed: number;
  total_paid: number;
  net_owed: number;
  last_payment: string | null;
}

export default function DisposalCollectionScreen() {
  const [disposalDues, setDisposalDues] = useState<RetailerDisposalDue[]>([]);
  const [companyPayments, setCompanyPayments] = useState<CompanyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedDue, setSelectedDue] = useState<DisposalDue | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [collectionHistory, setCollectionHistory] = useState<RetailerTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'collected' | 'payments' | 'companies'>('pending');
  const [companySummaries, setCompanySummaries] = useState<CompanySummary[]>([]);
  const [companyPaymentModalVisible, setCompanyPaymentModalVisible] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanySummary | null>(null);
  const [companyPaymentAmount, setCompanyPaymentAmount] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current retailer
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const { data: retailerData, error: retailerError } = await supabase
        .from('retailers')
        .select('id, registered_businesses')
        .eq('user_id', user.id)
        .single();

      if (retailerError) {
        console.error('Retailer fetch error:', retailerError);
        return;
      }

      const retailer = retailerData as { id: string; registered_businesses: string[] } | null;

      if (retailer) {
        // Fetch disposal dues
        if (retailer.registered_businesses?.length > 0) {
          const businessIds = retailer.registered_businesses;
          
          // Fetch pending dues
          const { data: pendingDues } = await supabase
            .from('retailer_disposal_dues')
            .select(`
              *,
              business_disposal_due:business_disposal_due_id(business_id, business:business_id(name, type))
            `)
            .eq('retailer_id', retailer.id)
            .eq('status', 'pending')
            .order('due_date', { ascending: true });

          setDisposalDues(pendingDues || []);

          // Fetch collection history from retailer_transactions
          const { data: transactions } = await supabase
            .from('retailer_transactions')
            .select(`
              *,
              business:businesses(name, type)
            `)
            .eq('retailer_id', retailer.id)
            .in('business_id', businessIds)
            .order('timestamp', { ascending: false })
            .limit(50);

          setCollectionHistory(transactions || []);
        }

        // Fetch company payments
        const { data: paymentsData } = await supabase
          .from('company_payments')
          .select(`
            *,
            company:companies(name)
          `)
          .eq('retailer_id', retailer.id)
          .order('timestamp', { ascending: false });

        setCompanyPayments(paymentsData || []);

        // Calculate company summaries (improved logic)
        await calculateCompanySummaries(retailer.id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateCompanySummaries = async (retailerId: string) => {
    try {
      // Get retailer inventory with company products
      const { data: inventoryData } = await supabase
        .from('retailer_inventory')
        .select(`
          quantity,
          company_product:company_products(
            disposal_cost,
            company:companies(id, name)
          )
        `)
        .eq('retailer_id', retailerId)
        .gt('quantity', 0);

      // Get all company payments for this retailer
      const { data: paymentData } = await supabase
        .from('company_payments')
        .select('company_id, amount, status')
        .eq('retailer_id', retailerId);

      if (inventoryData && paymentData) {
        const companyTotals: { 
          [key: string]: { 
            name: string; 
            totalOwed: number; 
            totalPaid: number;
            lastPayment: string | null;
          } 
        } = {};
        
        // Calculate total owed based on current inventory
        inventoryData.forEach((item: any) => {
          if (item.company_product?.company) {
            const companyId = item.company_product.company.id;
            const companyName = item.company_product.company.name;
            const owedAmount = item.quantity * item.company_product.disposal_cost;
            
            if (!companyTotals[companyId]) {
              companyTotals[companyId] = { 
                name: companyName, 
                totalOwed: 0, 
                totalPaid: 0,
                lastPayment: null
              };
            }
            companyTotals[companyId].totalOwed += owedAmount;
          }
        });

        // Calculate total paid to each company
        paymentData.forEach((payment: any) => {
          if (companyTotals[payment.company_id]) {
            if (payment.status === 'completed') {
              companyTotals[payment.company_id].totalPaid += payment.amount;
            }
          } else {
            // Company not in inventory but has payments (maybe sold products)
            companyTotals[payment.company_id] = {
              name: 'Unknown Company',
              totalOwed: 0,
              totalPaid: payment.status === 'completed' ? payment.amount : 0,
              lastPayment: null
            };
          }
        });

        // Get last payment dates for companies with payments
        for (const companyId of Object.keys(companyTotals)) {
          const { data: lastPayment } = await supabase
            .from('company_payments')
            .select('timestamp')
            .eq('retailer_id', retailerId)
            .eq('company_id', companyId)
            .eq('status', 'completed')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

          if (lastPayment) {
            companyTotals[companyId].lastPayment = lastPayment.timestamp;
          }
        }

        // Convert to summaries array
        const summaries = Object.keys(companyTotals).map(companyId => {
          const company = companyTotals[companyId];
          const netOwed = Math.max(0, company.totalOwed - company.totalPaid);
          
          return {
            company_id: companyId,
            company_name: company.name,
            total_owed: company.totalOwed,
            total_paid: company.totalPaid,
            net_owed: netOwed,
            last_payment: company.lastPayment,
          };
        }).filter(summary => summary.total_owed > 0 || summary.total_paid > 0); // Only show companies with transactions

        setCompanySummaries(summaries);
      }
    } catch (error) {
      console.error('Error calculating company summaries:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const collectPayment = async (due: RetailerDisposalDue) => {
    setSelectedDue(due as any);
    setPaymentAmount(due.amount.toString());
    setPaymentModalVisible(true);
  };

  const processPayment = async () => {
    if (!selectedDue || !paymentAmount) return;

    try {
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0) {
        Alert.alert('Error', 'Please enter a valid amount');
        return;
      }

      // Update disposal due status to paid
      const { error: updateError } = await supabase
        .from('retailer_disposal_dues')
        .update({ status: 'paid' })
        .eq('id', selectedDue.id);

      if (updateError) throw updateError;

      // Create retailer transaction record
      const { data: { user } } = await supabase.auth.getUser();
      const { data: retailerData } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      if (retailerData) {
        // Get business_id from the business_disposal_due
        const { data: businessDueData, error: businessDueError } = await supabase
          .from('business_disposal_dues')
          .select('business_id')
          .eq('id', selectedDue.business_disposal_due_id)
          .single();
          
        if (businessDueError) throw businessDueError;
        
        const { error: transactionError } = await supabase
          .from('retailer_transactions')
          .insert({
            retailer_id: retailerData.id,
            business_id: businessDueData.business_id,
            amount: amount,
            timestamp: new Date().toISOString()
          });

        if (transactionError) throw transactionError;
      }

      Alert.alert('Success', 'Payment collected successfully');
      setPaymentModalVisible(false);
      setSelectedDue(null);
      setPaymentAmount('');
      fetchData();
    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('Error', 'Failed to process payment');
    }
  };

  const initiateCompanyPayment = (company: CompanySummary) => {
    setSelectedCompany(company);
    setCompanyPaymentAmount(company.net_owed.toString());
    setCompanyPaymentModalVisible(true);
  };

  const processCompanyPayment = async () => {
    if (!selectedCompany || !companyPaymentAmount) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      const amount = parseFloat(companyPaymentAmount);
      if (isNaN(amount) || amount <= 0) {
        Alert.alert('Error', 'Please enter a valid amount greater than 0');
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

      // Create company payment record
      const { error: paymentError } = await supabase
        .from('company_payments')
        .insert({
          company_id: selectedCompany.company_id,
          retailer_id: retailerData.id,
          amount: amount,
          status: 'completed', // Mark as completed immediately
          timestamp: new Date().toISOString(),
        });

      if (paymentError) throw paymentError;

      Alert.alert(
        'Success', 
        `Payment of ₹${amount.toFixed(2)} to ${selectedCompany.company_name} processed successfully`
      );
      
      setCompanyPaymentModalVisible(false);
      setSelectedCompany(null);
      setCompanyPaymentAmount('');
      
      // Refresh data to show updated balances
      fetchData();
    } catch (error) {
      console.error('Error paying to company:', error);
      Alert.alert('Error', 'Failed to process payment to company');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'paid': return 'text-green-600';
      case 'overdue': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'time';
      case 'paid': return 'checkmark-circle';
      case 'overdue': return 'warning';
      default: return 'help-circle';
    }
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const renderCompanySummary = ({ item }: { item: CompanySummary }) => (
    <View className="bg-white rounded-lg p-4 mb-3 shadow-sm">
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800 mb-2">
            {item.company_name}
          </Text>
          
          <View className="space-y-1">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Total Owed:</Text>
              <Text className="font-semibold text-red-600">₹{item.total_owed.toFixed(2)}</Text>
            </View>
            
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Total Paid:</Text>
              <Text className="font-semibold text-green-600">₹{item.total_paid.toFixed(2)}</Text>
            </View>
            
            <View className="flex-row justify-between border-t border-gray-200 pt-1">
              <Text className="font-semibold text-gray-800">Balance Due:</Text>
              <Text className={`font-bold ${item.net_owed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ₹{item.net_owed.toFixed(2)}
              </Text>
            </View>
          </View>
          
          {item.last_payment && (
            <Text className="text-sm text-gray-500 mt-2">
              Last payment: {new Date(item.last_payment).toLocaleDateString()}
            </Text>
          )}
          {!item.last_payment && item.total_owed > 0 && (
            <Text className="text-sm text-orange-500 mt-2">
              No previous payments
            </Text>
          )}
        </View>
      </View>
      
      <TouchableOpacity 
        onPress={() => initiateCompanyPayment(item)}
        className={`rounded-lg py-3 mt-2 ${
          item.net_owed > 0 ? 'bg-blue-600' : 'bg-gray-400'
        }`}
        disabled={item.net_owed <= 0}
      >
        <Text className="text-white text-center font-medium">
          {item.net_owed > 0 ? `Pay ₹${item.net_owed.toFixed(2)}` : 'Fully Paid'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading collection data...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="p-4 bg-white border-b border-gray-200">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Collection Management</Text>
        <Text className="text-gray-600">Manage disposal cost collection and payments</Text>
      </View>

      {/* Tab Navigation */}
      <View className="flex-row bg-white border-b border-gray-200">
        <TouchableOpacity
          className={`flex-1 py-3 px-2 ${activeTab === 'pending' ? 'border-b-2 border-green-600' : ''}`}
          onPress={() => setActiveTab('pending')}
        >
          <Text className={`text-center font-semibold text-xs ${activeTab === 'pending' ? 'text-green-600' : 'text-gray-600'}`}>
            Pending ({disposalDues.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 px-2 ${activeTab === 'collected' ? 'border-b-2 border-green-600' : ''}`}
          onPress={() => setActiveTab('collected')}
        >
          <Text className={`text-center font-semibold text-xs ${activeTab === 'collected' ? 'text-green-600' : 'text-gray-600'}`}>
            Collected ({collectionHistory.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 px-2 ${activeTab === 'payments' ? 'border-b-2 border-green-600' : ''}`}
          onPress={() => setActiveTab('payments')}
        >
          <Text className={`text-center font-semibold text-xs ${activeTab === 'payments' ? 'text-green-600' : 'text-gray-600'}`}>
            Payments ({companyPayments.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 px-2 ${activeTab === 'companies' ? 'border-b-2 border-green-600' : ''}`}
          onPress={() => setActiveTab('companies')}
        >
          <Text className={`text-center font-semibold text-xs ${activeTab === 'companies' ? 'text-green-600' : 'text-gray-600'}`}>
            Companies ({companySummaries.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'pending' && (
        <View className="flex-1 p-4">
          {disposalDues.length === 0 ? (
            <View className="flex-1 justify-center items-center">
              <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
              <Text className="text-xl font-semibold text-gray-800 mt-4">No Pending Collections</Text>
              <Text className="text-gray-600 text-center mt-2">All disposal costs have been collected</Text>
            </View>
          ) : (
            <FlatList
              data={disposalDues}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View className={`bg-white rounded-lg p-4 mb-3 border-l-4 ${isOverdue(item.due_date) ? 'border-red-500' : 'border-yellow-500'}`}>
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-gray-800">{item.business_disposal_due?.business?.name || 'Unknown Business'}</Text>
                      <Text className="text-gray-600">{item.business_disposal_due?.business?.type || 'Unknown Type'}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xl font-bold text-green-600">₹{item.amount}</Text>
                      <Text className={`text-sm ${isOverdue(item.due_date) ? 'text-red-600' : 'text-yellow-600'}`}>
                        {isOverdue(item.due_date) ? 'Overdue' : 'Due: ' + new Date(item.due_date).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  
                  <View className="flex-row justify-between items-center mt-3">
                    <View className="flex-row items-center">
                      <Ionicons 
                        name={getStatusIcon(item.status)} 
                        size={16} 
                        color={isOverdue(item.due_date) ? '#dc2626' : '#ca8a04'} 
                      />
                      <Text className={`ml-1 text-sm ${getStatusColor(item.status)}`}>
                        {isOverdue(item.due_date) ? 'Overdue' : 'Pending Collection'}
                      </Text>
                    </View>
                    
                    <TouchableOpacity
                      className="bg-green-600 py-2 px-4 rounded-lg"
                      onPress={() => collectPayment(item)}
                    >
                      <Text className="text-white font-semibold">Collect</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {activeTab === 'collected' && (
        <View className="flex-1 p-4">
          {collectionHistory.length === 0 ? (
            <View className="flex-1 justify-center items-center">
              <Ionicons name="receipt" size={64} color="#6b7280" />
              <Text className="text-xl font-semibold text-gray-800 mt-4">No Collection History</Text>
              <Text className="text-gray-600 text-center mt-2">Collections will appear here once processed</Text>
            </View>
          ) : (
            <FlatList
              data={collectionHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View className="bg-white rounded-lg p-4 mb-3 border-l-4 border-green-500">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-gray-800">{item.business?.name || 'Business'}</Text>
                      <Text className="text-gray-600">{item.business?.type || ''}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xl font-bold text-green-600">₹{item.amount}</Text>
                      <Text className="text-sm text-gray-600">
                        Collected: {new Date(item.timestamp).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  
                  <View className="flex-row items-center mt-2">
                    <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                    <Text className="ml-1 text-sm text-green-600">Payment Collected</Text>
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {activeTab === 'payments' && (
        <View className="flex-1 p-4">
          {companyPayments.length === 0 ? (
            <View className="flex-1 justify-center items-center">
              <Ionicons name="card" size={64} color="#6b7280" />
              <Text className="text-xl font-semibold text-gray-800 mt-4">No Payment History</Text>
              <Text className="text-gray-600 text-center mt-2">Company payments will appear here</Text>
            </View>
          ) : (
            <FlatList
              data={companyPayments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View className="bg-white rounded-lg p-4 mb-3">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-lg font-semibold text-gray-800">
                      {item.company?.name || 'Company Payment'}
                    </Text>
                    <Text className="text-xl font-bold text-blue-600">₹{item.amount}</Text>
                  </View>
                  
                  <View className="flex-row justify-between items-center">
                    <Text className="text-gray-600">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </Text>
                    <View className={`px-2 py-1 rounded ${
                      item.status === 'completed' ? 'bg-green-100' : 
                      item.status === 'pending' ? 'bg-yellow-100' : 
                      'bg-red-100'
                    }`}>
                      <Text className={`text-sm ${
                        item.status === 'completed' ? 'text-green-800' : 
                        item.status === 'pending' ? 'text-yellow-800' : 
                        'text-red-800'
                      }`}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {activeTab === 'companies' && (
        <View className="flex-1 p-4">
          {companySummaries.length === 0 ? (
            <View className="flex-1 justify-center items-center">
              <Ionicons name="business" size={64} color="#6b7280" />
              <Text className="text-xl font-semibold text-gray-800 mt-4">No Company Payments Due</Text>
              <Text className="text-gray-600 text-center mt-2">Purchase products from companies to see payment obligations</Text>
            </View>
          ) : (
            <FlatList
              data={companySummaries}
              keyExtractor={(item) => item.company_id}
              renderItem={renderCompanySummary}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* Payment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={paymentModalVisible}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-lg p-6 m-4 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-800 mb-4">Collect Payment</Text>
            
            {selectedDue && (
              <>
                <Text className="text-gray-600 mb-2">Business: {selectedDue.business_disposal_due?.business?.name || 'Unknown Business'}</Text>
                <Text className="text-gray-600 mb-4">Due Amount: ₹{selectedDue.amount}</Text>
              </>
            )}
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Payment Amount (₹)"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
            />
            
            <View className="flex-row space-x-3">
              <TouchableOpacity 
                onPress={() => setPaymentModalVisible(false)}
                className="flex-1 bg-gray-200 rounded-lg py-3"
              >
                <Text className="text-gray-700 text-center font-medium">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={processPayment}
                className="flex-1 bg-green-600 rounded-lg py-3"
              >
                <Text className="text-white text-center font-medium">Collect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Company Payment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={companyPaymentModalVisible}
        onRequestClose={() => setCompanyPaymentModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-lg p-6 m-4 w-full max-w-sm">
            <Text className="text-xl font-bold text-gray-800 mb-4">Pay Company</Text>
            
            {selectedCompany && (
              <>
                <Text className="text-gray-600 mb-2">Company: {selectedCompany.company_name}</Text>
                <Text className="text-gray-600 mb-2">Total Owed: ₹{selectedCompany.total_owed.toFixed(2)}</Text>
                <Text className="text-gray-600 mb-2">Already Paid: ₹{selectedCompany.total_paid.toFixed(2)}</Text>
                <Text className="text-red-600 font-semibold mb-4">Balance Due: ₹{selectedCompany.net_owed.toFixed(2)}</Text>
              </>
            )}
            
            <TextInput
              className="border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Payment Amount (₹)"
              value={companyPaymentAmount}
              onChangeText={setCompanyPaymentAmount}
              keyboardType="numeric"
            />
            
            <View className="flex-row space-x-3">
              <TouchableOpacity 
                onPress={() => setCompanyPaymentModalVisible(false)}
                className="flex-1 bg-gray-200 rounded-lg py-3"
              >
                <Text className="text-gray-700 text-center font-medium">Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={processCompanyPayment}
                className="flex-1 bg-blue-600 rounded-lg py-3"
              >
                <Text className="text-white text-center font-medium">Pay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}