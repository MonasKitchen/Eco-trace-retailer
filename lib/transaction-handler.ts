import { createCompleteDisposalDueFlow } from "./disposal-dues";
import { supabase } from "./supabase";

interface InventoryWithCompanyProduct {
  retailer_id: string;
  company_product_id: string | null;
  company_products: {
    company_id: string;
  }[];
}

export interface TransactionData {
  user_id: string;
  inventory_id: string;
  cost_paid: number;
  plastic_disposal_fee: number;
}

export interface InventoryTransactionData {
  inventory_id: string;
  business_id: string;
  quantity: number;
  transaction_type: "purchase" | "return" | "adjustment";
  unit_price: number;
  total_amount: number;
  plastic_quantity_purchased: number;
  plastic_disposal_cost: number;
}

// Create consumer transaction and disposal due flow
export async function createConsumerTransaction(
  transactionData: TransactionData
) {
  try {
    // Create the transaction
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: transactionData.user_id,
        inventory_id: transactionData.inventory_id,
        cost_paid: transactionData.cost_paid,
        plastic_disposal_fee: transactionData.plastic_disposal_fee,
      })
      .select()
      .single();

    if (transactionError) throw transactionError;

    // If there's a plastic disposal fee, create the disposal due flow
    if (transactionData.plastic_disposal_fee > 0) {
      // Get inventory details to find retailer and company
      const { data: inventoryData, error: inventoryError } = (await supabase
        .from("retailer_inventory")
        .select(
          `
          retailer_id,
          company_product_id,
          company_products!inner(company_id)
        `
        )
        .eq("id", transactionData.inventory_id)
        .single()) as { data: InventoryWithCompanyProduct | null; error: any };

      if (inventoryError || !inventoryData)
        throw inventoryError || new Error("Inventory data not found");

      // For consumer transactions, we need to find which business the consumer belongs to
      // This is a simplified approach - in reality, you'd need to track business-consumer relationships
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", transactionData.user_id)
        .single();

      if (userError) throw userError;

      // If user is a business owner, use their business
      if (userData.user_type === "business") {
        const { data: businessData, error: businessError } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", transactionData.user_id)
          .single();

        if (businessError) throw businessError;

        // Ensure we have company product data
        if (
          !inventoryData.company_products ||
          inventoryData.company_products.length === 0
        ) {
          throw new Error("Company product data not found for inventory item");
        }

        // Create complete disposal due flow
        await createCompleteDisposalDueFlow(
          transactionData.user_id, // consumer_id
          transaction.id, // transaction_id
          businessData.id, // business_id
          inventoryData.retailer_id, // retailer_id
          inventoryData.company_products[0].company_id, // company_id
          transactionData.plastic_disposal_fee // amount
        );
      }
    }

    return transaction;
  } catch (error) {
    console.error("Error creating consumer transaction:", error);
    throw error;
  }
}

// Create inventory transaction (business purchase)
export async function createInventoryTransaction(
  transactionData: InventoryTransactionData
) {
  try {
    // Create the inventory transaction
    const { data: transaction, error: transactionError } = await supabase
      .from("inventory_transactions")
      .insert(transactionData)
      .select()
      .single();

    if (transactionError) throw transactionError;

    // If there's a plastic disposal cost, create the disposal due flow
    if (
      transactionData.plastic_disposal_cost > 0 &&
      transactionData.transaction_type === "purchase"
    ) {
      // Get inventory details to find retailer and company
      const { data: inventoryData, error: inventoryError } = (await supabase
        .from("retailer_inventory")
        .select(
          `
          retailer_id,
          company_product_id,
          company_products!inner(company_id)
        `
        )
        .eq("id", transactionData.inventory_id)
        .single()) as { data: InventoryWithCompanyProduct | null; error: any };

      if (inventoryError || !inventoryData)
        throw inventoryError || new Error("Inventory data not found");

      // Create a consumer transaction record for the business purchase
      const { data: consumerTransaction, error: consumerTransactionError } =
        await supabase
          .from("transactions")
          .insert({
            user_id: (
              await supabase
                .from("businesses")
                .select("owner_id")
                .eq("id", transactionData.business_id)
                .single()
            ).data?.owner_id,
            inventory_id: transactionData.inventory_id,
            cost_paid: transactionData.total_amount,
            plastic_disposal_fee: transactionData.plastic_disposal_cost,
          })
          .select()
          .single();

      if (consumerTransactionError) throw consumerTransactionError;

      // Ensure we have company product data
      if (
        !inventoryData.company_products ||
        inventoryData.company_products.length === 0
      ) {
        throw new Error("Company product data not found for inventory item");
      }

      // Create complete disposal due flow
      await createCompleteDisposalDueFlow(
        consumerTransaction.user_id, // consumer_id (business owner)
        consumerTransaction.id, // transaction_id
        transactionData.business_id, // business_id
        inventoryData.retailer_id, // retailer_id
        inventoryData.company_products[0].company_id, // company_id
        transactionData.plastic_disposal_cost // amount
      );
    }

    return transaction;
  } catch (error) {
    console.error("Error creating inventory transaction:", error);
    throw error;
  }
}

// Update inventory quantity after transaction
export async function updateInventoryAfterTransaction(
  inventoryId: string,
  quantity: number,
  transactionType: "purchase" | "return" | "adjustment"
) {
  try {
    // Get current inventory quantity
    const { data: currentInventory, error: fetchError } = await supabase
      .from("retailer_inventory")
      .select("quantity")
      .eq("id", inventoryId)
      .single();

    if (fetchError) throw fetchError;

    let newQuantity: number;

    switch (transactionType) {
      case "purchase":
        newQuantity = currentInventory.quantity - quantity; // Reduce inventory
        break;
      case "return":
        newQuantity = currentInventory.quantity + quantity; // Increase inventory
        break;
      case "adjustment":
        newQuantity = quantity; // Set to exact quantity
        break;
      default:
        throw new Error(`Invalid transaction type: ${transactionType}`);
    }

    // Ensure quantity doesn't go below 0
    if (newQuantity < 0) {
      throw new Error(
        `Insufficient inventory. Current: ${currentInventory.quantity}, Requested: ${quantity}`
      );
    }

    const { error } = await supabase
      .from("retailer_inventory")
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inventoryId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error("Error updating inventory:", error);
    throw error;
  }
}

// Create business transaction (for tracking business purchases)
export async function createBusinessTransaction(
  businessId: string,
  inventoryId: string,
  productId?: string
) {
  try {
    const { data: transaction, error } = await supabase
      .from("business_transactions")
      .insert({
        business_id: businessId,
        inventory_id: inventoryId,
        product_id: productId,
        status: "completed",
      })
      .select()
      .single();

    if (error) throw error;
    return transaction;
  } catch (error) {
    console.error("Error creating business transaction:", error);
    throw error;
  }
}

// Complete purchase flow (inventory transaction + business transaction + disposal dues)
export async function completePurchaseFlow(
  businessId: string,
  inventoryId: string,
  quantity: number,
  unitPrice: number,
  plasticQuantity: number = 0,
  plasticCostPerGram: number = 0.1
) {
  try {
    const totalAmount = quantity * unitPrice;
    const plasticDisposalCost = plasticQuantity * plasticCostPerGram;

    // Create inventory transaction
    const inventoryTransaction = await createInventoryTransaction({
      inventory_id: inventoryId,
      business_id: businessId,
      quantity,
      transaction_type: "purchase",
      unit_price: unitPrice,
      total_amount: totalAmount,
      plastic_quantity_purchased: plasticQuantity,
      plastic_disposal_cost: plasticDisposalCost,
    });

    // Create business transaction
    const businessTransaction = await createBusinessTransaction(
      businessId,
      inventoryId
    );

    // Update inventory quantity
    await updateInventoryAfterTransaction(inventoryId, quantity, "purchase");

    return {
      inventoryTransaction,
      businessTransaction,
    };
  } catch (error) {
    console.error("Error completing purchase flow:", error);
    throw error;
  }
}
