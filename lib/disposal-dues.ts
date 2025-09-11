import { supabase } from "./supabase";

export interface DisposalDueFlow {
  consumer_disposal_due_id?: string;
  business_disposal_due_id?: string;
  retailer_disposal_due_id?: string;
  company_disposal_due_id?: string;
}

// Create consumer disposal due when a consumer makes a purchase
export async function createConsumerDisposalDue(
  consumerId: string,
  transactionId: string,
  amount: number,
  dueDate: Date
) {
  try {
    const { data, error } = await supabase
      .from("consumer_disposal_dues")
      .insert({
        consumer_id: consumerId,
        transaction_id: transactionId,
        amount,
        due_date: dueDate.toISOString().split("T")[0],
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating consumer disposal due:", error);
    throw error;
  }
}

// Create business disposal due from consumer disposal due
export async function createBusinessDisposalDue(
  businessId: string,
  consumerDisposalDueId: string,
  amount: number,
  dueDate: Date
) {
  try {
    const { data, error } = await supabase
      .from("business_disposal_dues")
      .insert({
        business_id: businessId,
        consumer_disposal_due_id: consumerDisposalDueId,
        amount,
        due_date: dueDate.toISOString().split("T")[0],
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating business disposal due:", error);
    throw error;
  }
}

// Create retailer disposal due from business disposal due
export async function createRetailerDisposalDue(
  retailerId: string,
  businessDisposalDueId: string,
  amount: number,
  dueDate: Date
) {
  try {
    const { data, error } = await supabase
      .from("retailer_disposal_dues")
      .insert({
        retailer_id: retailerId,
        business_disposal_due_id: businessDisposalDueId,
        amount,
        due_date: dueDate.toISOString().split("T")[0],
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating retailer disposal due:", error);
    throw error;
  }
}

// Create company disposal due from retailer disposal due
export async function createCompanyDisposalDue(
  companyId: string,
  retailerDisposalDueId: string,
  amount: number,
  dueDate: Date
) {
  try {
    const { data, error } = await supabase
      .from("company_disposal_dues")
      .insert({
        company_id: companyId,
        retailer_disposal_due_id: retailerDisposalDueId,
        amount,
        due_date: dueDate.toISOString().split("T")[0],
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating company disposal due:", error);
    throw error;
  }
}

// Create only consumer disposal due - let triggers handle the rest
export async function createCompleteDisposalDueFlow(
  consumerId: string,
  transactionId: string,
  businessId: string,
  retailerId: string,
  companyId: string,
  amount: number,
  dueDate: Date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
): Promise<DisposalDueFlow> {
  try {
    // Only create consumer disposal due - triggers will handle the cascade
    const consumerDue = await createConsumerDisposalDue(
      consumerId,
      transactionId,
      amount,
      dueDate
    );

    // Ensure business-retailer relationship is maintained
    await ensureBusinessRetailerRelationship(businessId, retailerId);

    return {
      consumer_disposal_due_id: consumerDue.id,
    };
  } catch (error) {
    console.error("Error creating disposal due flow:", error);
    throw error;
  }
}

// Ensure business is registered with retailer for trigger logic
async function ensureBusinessRetailerRelationship(
  businessId: string,
  retailerId: string
) {
  try {
    // Get current registered businesses
    const { data: retailer, error: fetchError } = await supabase
      .from("retailers")
      .select("registered_businesses")
      .eq("id", retailerId)
      .single();

    if (fetchError) throw fetchError;

    const currentBusinesses = retailer.registered_businesses || [];

    // Add business if not already registered
    if (!currentBusinesses.includes(businessId)) {
      const { error: updateError } = await supabase
        .from("retailers")
        .update({
          registered_businesses: [...currentBusinesses, businessId],
        })
        .eq("id", retailerId);

      if (updateError) throw updateError;
    }
  } catch (error) {
    console.error("Error ensuring business-retailer relationship:", error);
    throw error;
  }
}

// Pay consumer disposal due - let triggers handle the cascade
export async function payConsumerDisposalDue(consumerDisposalDueId: string) {
  try {
    // Only update consumer disposal due - triggers will handle the cascade
    const { error } = await supabase
      .from("consumer_disposal_dues")
      .update({ status: "paid" })
      .eq("id", consumerDisposalDueId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error paying consumer disposal due:", error);
    throw error;
  }
}

// Pay business disposal due - let triggers handle the cascade
export async function payBusinessDisposalDue(businessDisposalDueId: string) {
  try {
    const { error } = await supabase
      .from("business_disposal_dues")
      .update({ status: "paid" })
      .eq("id", businessDisposalDueId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error paying business disposal due:", error);
    throw error;
  }
}

// Pay retailer disposal due - let triggers handle the cascade
export async function payRetailerDisposalDue(retailerDisposalDueId: string) {
  try {
    const { error } = await supabase
      .from("retailer_disposal_dues")
      .update({ status: "paid" })
      .eq("id", retailerDisposalDueId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error paying retailer disposal due:", error);
    throw error;
  }
}

// Get all disposal dues for a retailer
export async function getRetailerDisposalDues(retailerId: string) {
  try {
    const { data, error } = await supabase
      .from("retailer_disposal_dues")
      .select(
        `
        *,
        business_disposal_dues(
          *,
          businesses(name),
          consumer_disposal_dues(
            *,
            users(name, email)
          )
        )
      `
      )
      .eq("retailer_id", retailerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching retailer disposal dues:", error);
    return [];
  }
}

// Get all disposal dues for a business
export async function getBusinessDisposalDues(businessId: string) {
  try {
    const { data, error } = await supabase
      .from("business_disposal_dues")
      .select(
        `
        *,
        consumer_disposal_dues!inner(
          *,
          users!inner(name, email),
          transactions!inner(cost_paid, plastic_disposal_fee)
        )
      `
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching business disposal dues:", error);
    return [];
  }
}

// Get all disposal dues for a company
export async function getCompanyDisposalDues(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("company_disposal_dues")
      .select(
        `
        *,
        retailer_disposal_dues!inner(
          *,
          retailers!inner(name),
          business_disposal_dues!inner(
            *,
            businesses!inner(name)
          )
        )
      `
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching company disposal dues:", error);
    return [];
  }
}

// Create retailer disposal due for company purchase (direct relationship)
export async function createRetailerCompanyDisposalDue(
  retailerId: string,
  companyId: string,
  amount: number,
  transactionId?: string
) {
  try {
    // Create retailer disposal due
    const retailerDueDate = new Date();
    retailerDueDate.setDate(retailerDueDate.getDate() + 30);

    const { data: retailerDue, error: retailerError } = await supabase
      .from("retailer_disposal_dues")
      .insert({
        retailer_id: retailerId,
        business_disposal_due_id: null, // Direct relationship
        amount,
        due_date: retailerDueDate.toISOString().split("T")[0],
        status: "pending",
        source_type: "company_purchase",
      })
      .select()
      .single();

    if (retailerError) throw retailerError;

    // Create company disposal due
    const companyDueDate = new Date();
    companyDueDate.setDate(companyDueDate.getDate() + 37);

    const { data: companyDue, error: companyError } = await supabase
      .from("company_disposal_dues")
      .insert({
        company_id: companyId,
        retailer_disposal_due_id: retailerDue.id,
        amount,
        due_date: companyDueDate.toISOString().split("T")[0],
        status: "pending",
        source_type: "direct_purchase",
      })
      .select()
      .single();

    if (companyError) throw companyError;

    return {
      retailer_disposal_due: retailerDue,
      company_disposal_due: companyDue,
    };
  } catch (error) {
    console.error("Error creating retailer-company disposal due:", error);
    throw error;
  }
}

// Update overdue status for all disposal dues
export async function updateOverdueDues() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Update consumer disposal dues
    await supabase
      .from("consumer_disposal_dues")
      .update({ status: "overdue" })
      .lt("due_date", today)
      .eq("status", "pending");

    // Update business disposal dues
    await supabase
      .from("business_disposal_dues")
      .update({ status: "overdue" })
      .lt("due_date", today)
      .eq("status", "pending");

    // Update retailer disposal dues
    await supabase
      .from("retailer_disposal_dues")
      .update({ status: "overdue" })
      .lt("due_date", today)
      .eq("status", "pending");

    // Update company disposal dues
    await supabase
      .from("company_disposal_dues")
      .update({ status: "overdue" })
      .lt("due_date", today)
      .eq("status", "pending");

    return true;
  } catch (error) {
    console.error("Error updating overdue dues:", error);
    throw error;
  }
}
