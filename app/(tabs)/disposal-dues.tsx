import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface DisposalDue {
  id: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  created_at: string;
  source_type: 'business_chain' | 'company_purchase';
  business_disposal_dues?: {
    id: string;
    businesses: {
      name: string;
    };
    consumer_disposal_dues: {
      id: string;
      users: {
        name: string;
        email: string;
      };
    };
  } | null;
}

// Raw type from Supabase query
interface RawDisposalDue {
  id: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  created_at: string;
  source_type: 'business_chain' | 'company_purchase';
  business_disposal_dues?: {
    id: string;
    businesses: { name: string }[];
    consumer_disposal_dues: {
      id: string;
      users: { name: string; email: string }[];
    }[];
  }[] | null;
}

export default function DisposalDuesScreen() {
  const [disposalDues, setDisposalDues] = useState<DisposalDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'pending' | 'paid' | 'overdue'>('pending');
  const [retailerId, setRetailerId] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    totalPending: 0,
    totalOverdue: 0,
    totalPaid: 0,
    pendingAmount: 0,
    overdueAmount: 0,
  });

  // Update overdue dues function
  const updateOverdueDues = useCallback(async (retailerIdParam: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('retailer_disposal_dues')
        .update({ status: 'overdue' })
        .eq('retailer_id', retailerIdParam)
        .eq('status', 'pending')
        .lt('due_date', today);

      if (error) {
        console.error('Error updating overdue dues:', error);
      }
    } catch (error) {
      console.error('Error in updateOverdueDues:', error);
    }
  }, []);

  // Fetch retailer disposal dues
  const fetchDisposalDues = useCallback(async (retailerIdParam?: string) => {
    try {
      setError(null);
      
      let currentRetailerId = retailerIdParam || retailerId;
      
      // Get current user and retailer if not already available
      if (!currentRetailerId) {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('User not authenticated');
        }

        const { data: retailerData, error: retailerError } = await supabase
          .from('retailers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (retailerError || !retailerData) {
          throw new Error('Retailer profile not found');
        }
        
        currentRetailerId = retailerData.id;
        setRetailerId(currentRetailerId);
      }

      // Update overdue status first
      await updateOverdueDues(currentRetailerId || ''
      );

      // Fetch retailer disposal dues with related data
      const { data: duesData, error: duesError } = await supabase
        .from('retailer_disposal_dues')
        .select(`
          id,
          amount,
          due_date,
          status,
          created_at,
          source_type,
          business_disposal_dues(
            id,
            businesses(
              name
            ),
            consumer_disposal_dues(
              id,
              users(
                name,
                email
              )
            )
          )
        `)
        .eq('retailer_id', currentRetailerId)
        .eq('source_type', 'business_chain')
        .order('created_at', { ascending: false });

      // Fetch direct company purchase dues
      const { data: directDuesData, error: directDuesError } = await supabase
        .from('retailer_disposal_dues')
        .select(`
          id,
          amount,
          due_date,
          status,
          created_at,
          source_type
        `)
        .eq('retailer_id', currentRetailerId)
        .eq('source_type', 'company_purchase')
        .order('created_at', { ascending: false });

      if (duesError && directDuesError) {
        throw new Error('Failed to fetch disposal dues');
      }

      // Combine and format the data
      const allDues: DisposalDue[] = [
        ...(duesData || []).map((due: any) => ({
          id: due.id,
          amount: Number(due.amount),
          due_date: due.due_date,
          status: due.status as 'pending' | 'paid' | 'overdue',
          created_at: due.created_at,
          source_type: due.source_type as 'business_chain' | 'company_purchase',
          business_disposal_dues: due.business_disposal_dues
        })),
        ...(directDuesData || []).map((due: any) => ({
          id: due.id,
          amount: Number(due.amount),
          due_date: due.due_date,
          status: due.status as 'pending' | 'paid' | 'overdue',
          created_at: due.created_at,
          source_type: due.source_type as 'business_chain' | 'company_purchase',
          business_disposal_dues: null
        }))
      ];

      // Sort by created_at descending
      allDues.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setDisposalDues(allDues);

      // Calculate summary
      const pending = allDues.filter(d => d.status === 'pending');
      const overdue = allDues.filter(d => d.status === 'overdue');
      const paid = allDues.filter(d => d.status === 'paid');

      setSummary({
        totalPending: pending.length,
        totalOverdue: overdue.length,
        totalPaid: paid.length,
        pendingAmount: pending.reduce((sum, d) => sum + d.amount, 0),
        overdueAmount: overdue.reduce((sum, d) => sum + d.amount, 0),
      });

    } catch (error) {
      console.error('Error fetching disposal dues:', error);
      setError(error instanceof Error ? error.message : 'Failed to load disposal dues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [retailerId, updateOverdueDues]);

  useEffect(() => {
    fetchDisposalDues();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDisposalDues();
  }, [fetchDisposalDues]);

  const handlePayDue = useCallback(async (due: DisposalDue) => {
    try {
      Alert.alert(
        'Confirm Payment',
        `Mark disposal payment of ₹${due.amount.toLocaleString()} as completed for ${
          due.business_disposal_dues 
            ? due.business_disposal_dues.businesses.name
            : 'company product purchase'
        }?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark as Paid',
            onPress: async () => {
              try {
                // Mark retailer disposal due as paid - this will trigger company disposal due creation
                const { error } = await supabase
                  .from('retailer_disposal_dues')
                  .update({ status: 'paid' })
                  .eq('id', due.id);
                
                if (error) throw error;
                
                Alert.alert('Success', 'Payment marked as received');
                fetchDisposalDues();
              } catch (error) {
                console.error('Error marking payment:', error);
                Alert.alert('Error', 'Failed to mark payment as received');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error handling payment:', error);
      Alert.alert('Error', 'Failed to process payment');
    }
  }, [fetchDisposalDues]);

  const sendReminder = useCallback(async (due: DisposalDue) => {
    try {
      // In a real app, this would send an email/SMS reminder
      Alert.alert(
        'Reminder Sent',
        `Reminder sent ${due.business_disposal_dues ? `to ${due.business_disposal_dues.businesses.name}` : 'for company disposal payment'} for payment of ₹${due.amount.toLocaleString()}`
      );
    } catch (error) {
      console.error('Error sending reminder:', error);
      Alert.alert('Error', 'Failed to send reminder');
    }
  }, []);

  const getFilteredDues = useCallback(() => {
    return disposalDues.filter(due => due.status === selectedTab);
  }, [disposalDues, selectedTab]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10b981';
      case 'overdue': return '#ef4444';
      case 'pending': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'paid': return '#d1fae5';
      case 'overdue': return '#fee2e2';
      case 'pending': return '#fef3c7';
      default: return '#f3f4f6';
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={{ color: '#6b7280', marginTop: 10 }}>Loading disposal dues...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', padding: 20 }}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={{ color: '#dc2626', textAlign: 'center', marginBottom: 20, fontSize: 16 }}>{error}</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#059669', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
          onPress={() => {
            setLoading(true);
            fetchDisposalDues();
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filteredDues = getFilteredDues();

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <View style={{ padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 }}>Disposal Dues</Text>
        <Text style={{ color: '#6b7280' }}>Track and manage plastic disposal payments</Text>
      </View>

      {/* Summary Cards */}
      <View style={{ padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: '#fef3c7', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#92400e' }}>{summary.totalPending}</Text>
            <Text style={{ color: '#92400e', fontSize: 12 }}>Pending</Text>
            <Text style={{ color: '#92400e', fontSize: 10 }}>₹{summary.pendingAmount.toLocaleString()}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#dc2626' }}>{summary.totalOverdue}</Text>
            <Text style={{ color: '#dc2626', fontSize: 12 }}>Overdue</Text>
            <Text style={{ color: '#dc2626', fontSize: 10 }}>₹{summary.overdueAmount.toLocaleString()}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#d1fae5', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#10b981' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#065f46' }}>{summary.totalPaid}</Text>
            <Text style={{ color: '#065f46', fontSize: 12 }}>Paid</Text>
          </View>
        </View>
      </View>

      {/* Tab Selector */}
      <View style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['pending', 'overdue', 'paid'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: selectedTab === tab ? '#059669' : '#f3f4f6',
                borderWidth: 1,
                borderColor: selectedTab === tab ? '#059669' : '#d1d5db'
              }}
              onPress={() => setSelectedTab(tab)}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontWeight: '500',
                  color: selectedTab === tab ? 'white' : '#374151',
                  textTransform: 'capitalize'
                }}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Disposal Dues List */}
      <ScrollView 
        style={{ flex: 1 }} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={{ padding: 16 }}>
          {filteredDues.length === 0 ? (
            <View style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, alignItems: 'center' }}>
              <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
              <Text style={{ color: '#9ca3af', fontSize: 16, marginTop: 8 }}>
                No {selectedTab} disposal dues found
              </Text>
            </View>
          ) : (
            filteredDues.map((due) => (
              <View
                key={due.id}
                style={{
                  backgroundColor: 'white',
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    {due.business_disposal_dues ? (
                      <>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 4 }}>
                          {due.business_disposal_dues.businesses.name}
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 2 }}>
                          Consumer: {due.business_disposal_dues.consumer_disposal_dues.users.name}
                        </Text>
                        <Text style={{ color: '#9ca3af', fontSize: 12 }}>
                          {due.business_disposal_dues.consumer_disposal_dues.users.email}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 4 }}>
                          Company Product Purchase
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 2 }}>
                          Disposal obligation from company product purchase
                        </Text>
                        <Text style={{ color: '#9ca3af', fontSize: 12 }}>
                          Pay this to fulfill your disposal obligations to the company
                        </Text>
                      </>
                    )}
                  </View>
                  <View
                    style={{
                      backgroundColor: getStatusBgColor(due.status),
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 4
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '500',
                        color: getStatusColor(due.status),
                        textTransform: 'uppercase'
                      }}
                    >
                      {due.status}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#059669' }}>
                      ₹{due.amount.toLocaleString()}
                    </Text>
                    <Text style={{ color: '#6b7280', fontSize: 12 }}>
                      Due: {new Date(due.due_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'right' }}>
                      Created: {new Date(due.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons */}
                {due.status !== 'paid' && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#059669',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onPress={() => handlePayDue(due)}
                    >
                      <Ionicons name="checkmark-circle" size={16} color="white" />
                      <Text style={{ color: 'white', fontWeight: '500', marginLeft: 4 }}>
                        Mark as Paid
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#f3f4f6',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onPress={() => sendReminder(due)}
                    >
                      <Ionicons name="mail" size={16} color="#6b7280" />
                      <Text style={{ color: '#6b7280', fontWeight: '500', marginLeft: 4 }}>
                        Remind
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}