-- EcoTrace Retailer System - Final Project Schema
-- This schema implements the complete flow: Companies -> Products -> Retailer Inventory -> Business Purchases -> Consumer Payments

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (for all user types)
CREATE TABLE users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('consumer', 'business', 'retailer', 'company')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Companies table (plastic companies)
CREATE TABLE companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  address TEXT,
  registration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verification_status TEXT DEFAULT 'verified' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  disposal_rates JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Retailers table
CREATE TABLE retailers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  registered_businesses INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Businesses table
CREATE TABLE businesses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  verification_status TEXT DEFAULT 'verified' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Company Products table (product templates from companies)
CREATE TABLE company_products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  disposal_cost DECIMAL(10,2) NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  qr_code_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Retailer Inventory table (actual inventory items)
CREATE TABLE retailer_inventory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_product_id UUID REFERENCES company_products(id) ON DELETE CASCADE, -- Optional: for company products
  retailer_id UUID REFERENCES retailers(id) ON DELETE CASCADE,
  -- Product details (for retailer-created products)
  product_name TEXT, -- Name of the product (e.g., "Chips Packet", "Biscuit Box")
  product_category TEXT, -- Category (e.g., "Snacks", "Beverages")
  product_description TEXT, -- Optional description
  is_custom_product BOOLEAN DEFAULT false, -- True if retailer created this product
  -- Inventory details
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2) NOT NULL,
  plastic_quantity_grams DECIMAL(8,2) NOT NULL DEFAULT 0, -- Plastic quantity in grams per unit
  plastic_cost_per_gram DECIMAL(6,4) NOT NULL DEFAULT 0.10, -- Cost per gram of plastic disposal
  total_plastic_cost DECIMAL(10,2) NOT NULL DEFAULT 0, -- Total plastic cost for this inventory item
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'out_of_stock', 'discontinued')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure either company_product_id OR custom product details are provided
  CONSTRAINT check_product_source CHECK (
    (company_product_id IS NOT NULL AND is_custom_product = false) OR 
    (product_name IS NOT NULL AND is_custom_product = true)
  )
);

-- Inventory Transactions table (stock movements)
CREATE TABLE inventory_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  inventory_id UUID REFERENCES retailer_inventory(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'return', 'adjustment')),
  unit_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  plastic_quantity_purchased DECIMAL(8,2) NOT NULL DEFAULT 0, -- Total plastic quantity in this transaction
  plastic_disposal_cost DECIMAL(10,2) NOT NULL DEFAULT 0, -- Plastic disposal cost for this transaction
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Consumer Transactions table (consumer purchases)
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES retailer_inventory(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cost_paid DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business Transactions table
CREATE TABLE business_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES retailer_inventory(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Retailer Transactions table (payments from businesses to retailers)
CREATE TABLE retailer_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  retailer_id UUID REFERENCES retailers(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Company Payments table (dummy payments from retailers to companies)
CREATE TABLE company_payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  retailer_id UUID REFERENCES retailers(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  payment_reference TEXT DEFAULT 'DUMMY_PAYMENT',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disposal Dues table (what businesses owe)
CREATE TABLE disposal_dues (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Environmental Reports table
CREATE TABLE environmental_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  report_data JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE INDEX idx_companies_user_id ON companies(user_id);
CREATE INDEX idx_companies_verification_status ON companies(verification_status);
CREATE INDEX idx_retailers_user_id ON retailers(user_id);
CREATE INDEX idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX idx_company_products_company_id ON company_products(company_id);
CREATE INDEX idx_retailer_inventory_retailer_id ON retailer_inventory(retailer_id);
CREATE INDEX idx_retailer_inventory_company_product_id ON retailer_inventory(company_product_id);
CREATE INDEX idx_inventory_transactions_inventory_id ON inventory_transactions(inventory_id);
CREATE INDEX idx_inventory_transactions_business_id ON inventory_transactions(business_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_inventory_id ON transactions(inventory_id);
CREATE INDEX idx_business_transactions_business_id ON business_transactions(business_id);
CREATE INDEX idx_business_transactions_inventory_id ON business_transactions(inventory_id);
CREATE INDEX idx_retailer_transactions_retailer_id ON retailer_transactions(retailer_id);
CREATE INDEX idx_retailer_transactions_business_id ON retailer_transactions(business_id);
CREATE INDEX idx_company_payments_company_id ON company_payments(company_id);
CREATE INDEX idx_company_payments_retailer_id ON company_payments(retailer_id);
CREATE INDEX idx_disposal_dues_business_id ON disposal_dues(business_id);
CREATE INDEX idx_environmental_reports_company_id ON environmental_reports(company_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailer_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposal_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE environmental_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Users
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (id = auth.uid());

-- RLS Policies for Companies
CREATE POLICY "Companies can view their own data" ON companies
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Companies can update their own data" ON companies
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Companies can insert their own data" ON companies
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for Company Products
CREATE POLICY "Companies can view their own products" ON company_products
  FOR SELECT USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Companies can insert their own products" ON company_products
  FOR INSERT WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Companies can update their own products" ON company_products
  FOR UPDATE USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Companies can delete their own products" ON company_products
  FOR DELETE USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Allow retailers to view all products from verified companies
CREATE POLICY "Retailers can view products from verified companies" ON company_products
  FOR SELECT USING (
    company_id IN (
      SELECT id FROM companies WHERE verification_status = 'verified'
    )
  );

-- RLS Policies for Retailers
CREATE POLICY "Retailers can view their own data" ON retailers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Retailers can update their own data" ON retailers
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Retailers can insert their own data" ON retailers
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for Retailer Inventory
CREATE POLICY "Retailers can view their own inventory" ON retailer_inventory
  FOR SELECT USING (retailer_id IN (SELECT id FROM retailers WHERE user_id = auth.uid()));

CREATE POLICY "Retailers can manage their own inventory" ON retailer_inventory
  FOR ALL USING (retailer_id IN (SELECT id FROM retailers WHERE user_id = auth.uid()));

-- RLS Policies for Inventory Transactions
CREATE POLICY "Retailers can view transactions for their inventory" ON inventory_transactions
  FOR SELECT USING (
    inventory_id IN (
      SELECT id FROM retailer_inventory WHERE retailer_id IN (
        SELECT id FROM retailers WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Businesses can view their own transactions" ON inventory_transactions
  FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- RLS Policies for Businesses
CREATE POLICY "Businesses can view their own data" ON businesses
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Businesses can update their own data" ON businesses
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Businesses can insert their own data" ON businesses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- RLS Policies for Transactions
CREATE POLICY "Users can view their own transactions" ON transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own transactions" ON transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for Business Transactions
CREATE POLICY "Businesses can view their own transactions" ON business_transactions
  FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

CREATE POLICY "Businesses can insert their own transactions" ON business_transactions
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- RLS Policies for Retailer Transactions
CREATE POLICY "Retailers can view their own transactions" ON retailer_transactions
  FOR SELECT USING (retailer_id IN (SELECT id FROM retailers WHERE user_id = auth.uid()));

CREATE POLICY "Businesses can view their own transactions" ON retailer_transactions
  FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- RLS Policies for Company Payments
CREATE POLICY "Companies can view their payments" ON company_payments
  FOR SELECT USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Retailers can view their payments" ON company_payments
  FOR SELECT USING (retailer_id IN (SELECT id FROM retailers WHERE user_id = auth.uid()));

-- RLS Policies for Disposal Dues
CREATE POLICY "Businesses can view their own dues" ON disposal_dues
  FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

CREATE POLICY "Retailers can view dues for their businesses" ON disposal_dues
  FOR SELECT USING (
    business_id = ANY(
      SELECT unnest(registered_businesses)::UUID FROM retailers WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for Environmental Reports
CREATE POLICY "Companies can view their reports" ON environmental_reports
  FOR SELECT USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Companies can insert their reports" ON environmental_reports
  FOR INSERT WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_retailers_updated_at BEFORE UPDATE ON retailers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_company_products_updated_at BEFORE UPDATE ON company_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_retailer_inventory_updated_at BEFORE UPDATE ON retailer_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update inventory quantity after transactions
CREATE OR REPLACE FUNCTION update_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_type = 'purchase' THEN
    UPDATE retailer_inventory 
    SET quantity = quantity - NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.inventory_id;
  ELSIF NEW.transaction_type = 'return' THEN
    UPDATE retailer_inventory 
    SET quantity = quantity + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.inventory_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for inventory quantity updates
CREATE TRIGGER trigger_update_inventory_quantity
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_quantity();

-- Create storage bucket for product QR codes
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-qrcodes', 'product-qrcodes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to the QR codes (read-only)
CREATE POLICY "Public can view QR codes"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-qrcodes' );

-- Allow authenticated users to upload QR codes
CREATE POLICY "Authenticated users can upload QR codes"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'product-qrcodes' );

-- Allow authenticated users to update their QR codes
CREATE POLICY "Authenticated users can update QR codes"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'product-qrcodes' );

-- Allow authenticated users to delete their QR codes
CREATE POLICY "Authenticated users can delete QR codes"
ON storage.objects FOR DELETE
USING ( bucket_id = 'product-qrcodes' );

