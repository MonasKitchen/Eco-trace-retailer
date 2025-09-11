-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('company', 'admin', 'business', 'retailer', 'consumer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Businesses Table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  admin_notes TEXT
);

-- Companies Table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  address TEXT,
  registration_date TIMESTAMPTZ DEFAULT NOW(),
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  disposal_rates JSONB DEFAULT '{}',
  total_disposal_collected NUMERIC DEFAULT 0,
  disposal_processing_capacity NUMERIC DEFAULT 0,
  disposal_license_number TEXT,
  disposal_license_expiry DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  admin_notes TEXT
);

-- Retailers Table
CREATE TABLE retailers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  registered_businesses TEXT[] DEFAULT '{}',
  email TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT,
  phone_number TEXT,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  admin_notes TEXT
);

-- Company Products Table
CREATE TABLE company_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  disposal_cost NUMERIC NOT NULL,
  retailer_id UUID REFERENCES retailers(id),
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retailer Inventory Table
CREATE TABLE retailer_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_product_id UUID REFERENCES company_products(id),
  retailer_id UUID REFERENCES retailers(id),
  quantity INTEGER DEFAULT 0,
  unit_price NUMERIC NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'out_of_stock', 'discontinued')),
  plastic_quantity_grams NUMERIC DEFAULT 0,
  plastic_cost_per_gram NUMERIC DEFAULT 0.10,
  total_plastic_cost NUMERIC DEFAULT 0,
  product_name TEXT,
  product_category TEXT,
  product_description TEXT,
  qr_code_url TEXT,
  qr_data TEXT,
  is_custom_product BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Transactions Table
CREATE TABLE business_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  product_id UUID,
  inventory_id UUID REFERENCES retailer_inventory(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Transactions Table
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID REFERENCES retailer_inventory(id),
  business_id UUID REFERENCES businesses(id),
  quantity INTEGER NOT NULL,
  transaction_type TEXT CHECK (transaction_type IN ('purchase', 'return', 'adjustment')),
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  plastic_quantity_purchased NUMERIC DEFAULT 0,
  plastic_disposal_cost NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retailer Transactions Table
CREATE TABLE retailer_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  retailer_id UUID REFERENCES retailers(id),
  business_id UUID REFERENCES businesses(id),
  amount NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (Consumer Purchases) Table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  product_id UUID,
  inventory_id UUID REFERENCES retailer_inventory(id),
  cost_paid NUMERIC NOT NULL,
  plastic_disposal_fee NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company Payments Table
CREATE TABLE company_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  retailer_id UUID REFERENCES retailers(id),
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consumer Disposal Dues Table
CREATE TABLE consumer_disposal_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID REFERENCES users(id),
  transaction_id UUID REFERENCES transactions(id),
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Disposal Dues Table
CREATE TABLE business_disposal_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  consumer_disposal_due_id UUID REFERENCES consumer_disposal_dues(id),
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retailer Disposal Dues Table
CREATE TABLE retailer_disposal_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  retailer_id UUID REFERENCES retailers(id),
  business_disposal_due_id UUID REFERENCES business_disposal_dues(id), -- Nullable for direct retailer-company relationships
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  source_type TEXT DEFAULT 'business_chain' CHECK (source_type IN ('business_chain', 'company_purchase')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company Disposal Dues Table
CREATE TABLE company_disposal_dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  retailer_disposal_due_id UUID REFERENCES retailer_disposal_dues(id),
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  source_type TEXT DEFAULT 'retailer_chain' CHECK (source_type IN ('retailer_chain', 'direct_purchase')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Inventory Table
CREATE TABLE business_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  product_id UUID,
  retailer_id UUID REFERENCES retailers(id),
  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  unit_price NUMERIC NOT NULL,
  disposal_cost NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'out_of_stock', 'discontinued')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- Environmental Reports Table
CREATE TABLE environmental_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  report_data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disposal Flow Automation Triggers
-- These triggers automatically create the next level disposal due when one is paid

-- Function to create business disposal due when consumer pays
CREATE OR REPLACE FUNCTION create_business_disposal_due()
RETURNS TRIGGER AS $$
DECLARE
    business_id_var UUID;
    retailer_id_var UUID;
BEGIN
    -- Only proceed if status changed to 'paid'
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
        
        -- Get business_id from the transaction
        SELECT bt.business_id INTO business_id_var
        FROM transactions t
        JOIN business_transactions bt ON bt.inventory_id = t.inventory_id
        WHERE t.id = NEW.transaction_id
        LIMIT 1;
        
        -- If business_id found, create business disposal due
        IF business_id_var IS NOT NULL THEN
            INSERT INTO business_disposal_dues (
                business_id,
                consumer_disposal_due_id,
                amount,
                due_date,
                status
            ) VALUES (
                business_id_var,
                NEW.id,
                NEW.amount,
                CURRENT_DATE + INTERVAL '15 days', -- 15 days for business
                'pending'
            );
            
            RAISE NOTICE 'Created business disposal due for business_id: %', business_id_var;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create retailer disposal due when business pays
CREATE OR REPLACE FUNCTION create_retailer_disposal_due()
RETURNS TRIGGER AS $$
DECLARE
    retailer_id_var UUID;
BEGIN
    -- Only proceed if status changed to 'paid'
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
        
        -- Get retailer_id from business's connected retailers
        -- First try registered_businesses array
        SELECT r.id INTO retailer_id_var
        FROM retailers r
        WHERE r.registered_businesses @> ARRAY[NEW.business_id::text]
        LIMIT 1;
        
        -- If not found, try to find retailer through inventory transactions
        IF retailer_id_var IS NULL THEN
            SELECT DISTINCT ri.retailer_id INTO retailer_id_var
            FROM inventory_transactions it
            JOIN retailer_inventory ri ON ri.id = it.inventory_id
            WHERE it.business_id = NEW.business_id
            LIMIT 1;
        END IF;
        
        -- If retailer_id found, create retailer disposal due
        IF retailer_id_var IS NOT NULL THEN
            INSERT INTO retailer_disposal_dues (
                retailer_id,
                business_disposal_due_id,
                amount,
                due_date,
                status,
                source_type
            ) VALUES (
                retailer_id_var,
                NEW.id,
                NEW.amount,
                CURRENT_DATE + INTERVAL '10 days', -- 10 days for retailer
                'pending',
                'business_chain'
            );
            
            RAISE NOTICE 'Created retailer disposal due for retailer_id: %', retailer_id_var;
        ELSE
            RAISE WARNING 'No retailer found for business_id: %', NEW.business_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create company disposal due when retailer pays
CREATE OR REPLACE FUNCTION create_company_disposal_due()
RETURNS TRIGGER AS $$
DECLARE
    company_id_var UUID;
BEGIN
    -- Only proceed if status changed to 'paid'
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
        
        -- Get company_id from retailer's inventory products
        SELECT DISTINCT cp.company_id INTO company_id_var
        FROM retailer_inventory ri
        JOIN company_products cp ON cp.id = ri.company_product_id
        WHERE ri.retailer_id = NEW.retailer_id
        LIMIT 1;
        
        -- If company_id found, create company disposal due
        IF company_id_var IS NOT NULL THEN
            INSERT INTO company_disposal_dues (
                company_id,
                retailer_disposal_due_id,
                amount,
                due_date,
                status,
                source_type
            ) VALUES (
                company_id_var,
                NEW.id,
                NEW.amount,
                CURRENT_DATE + INTERVAL '7 days', -- 7 days for company
                'pending',
                'retailer_chain'
            );
            
            RAISE NOTICE 'Created company disposal due for company_id: %', company_id_var;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_create_business_disposal_due ON consumer_disposal_dues;
CREATE TRIGGER trigger_create_business_disposal_due
    AFTER UPDATE ON consumer_disposal_dues
    FOR EACH ROW
    EXECUTE FUNCTION create_business_disposal_due();

DROP TRIGGER IF EXISTS trigger_create_retailer_disposal_due ON business_disposal_dues;
CREATE TRIGGER trigger_create_retailer_disposal_due
    AFTER UPDATE ON business_disposal_dues
    FOR EACH ROW
    EXECUTE FUNCTION create_retailer_disposal_due();

DROP TRIGGER IF EXISTS trigger_create_company_disposal_due ON retailer_disposal_dues;
CREATE TRIGGER trigger_create_company_disposal_due
    AFTER UPDATE ON retailer_disposal_dues
    FOR EACH ROW
    EXECUTE FUNCTION create_company_disposal_due();

-- Function to automatically create consumer disposal due when consumer buys product
CREATE OR REPLACE FUNCTION create_consumer_disposal_due_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
    -- Create consumer disposal due if plastic_disposal_fee > 0
    IF NEW.plastic_disposal_fee > 0 THEN
        INSERT INTO consumer_disposal_dues (
            consumer_id,
            transaction_id,
            amount,
            due_date,
            status
        ) VALUES (
            NEW.user_id,
            NEW.id,
            NEW.plastic_disposal_fee,
            CURRENT_DATE + INTERVAL '30 days', -- 30 days for consumer
            'pending'
        );
        
        RAISE NOTICE 'Created consumer disposal due for transaction: %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for consumer purchases
DROP TRIGGER IF EXISTS trigger_create_consumer_disposal_due ON transactions;
CREATE TRIGGER trigger_create_consumer_disposal_due
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION create_consumer_disposal_due_on_purchase();

-- View to track complete disposal flow
CREATE OR REPLACE VIEW disposal_flow_tracking AS
-- Traditional consumer -> business -> retailer -> company chain
SELECT 
    cdd.id as consumer_due_id,
    cdd.consumer_id,
    cdd.amount as consumer_amount,
    cdd.status as consumer_status,
    cdd.due_date as consumer_due_date,
    
    bdd.id as business_due_id,
    bdd.business_id,
    bdd.amount as business_amount,
    bdd.status as business_status,
    bdd.due_date as business_due_date,
    
    rdd.id as retailer_due_id,
    rdd.retailer_id,
    rdd.amount as retailer_amount,
    rdd.status as retailer_status,
    rdd.due_date as retailer_due_date,
    rdd.source_type as retailer_source_type,
    
    cmpdd.id as company_due_id,
    cmpdd.company_id,
    cmpdd.amount as company_amount,
    cmpdd.status as company_status,
    cmpdd.due_date as company_due_date,
    cmpdd.source_type as company_source_type,
    
    -- Flow completion status
    CASE 
        WHEN cmpdd.status = 'paid' THEN 'completed'
        WHEN cmpdd.id IS NOT NULL THEN 'at_company'
        WHEN rdd.id IS NOT NULL AND rdd.source_type = 'company_purchase' THEN 'direct_retailer_company'
        WHEN rdd.id IS NOT NULL THEN 'at_retailer'
        WHEN bdd.id IS NOT NULL THEN 'at_business'
        ELSE 'at_consumer'
    END as flow_stage
    
FROM consumer_disposal_dues cdd
LEFT JOIN business_disposal_dues bdd ON bdd.consumer_disposal_due_id = cdd.id
LEFT JOIN retailer_disposal_dues rdd ON rdd.business_disposal_due_id = bdd.id
LEFT JOIN company_disposal_dues cmpdd ON cmpdd.retailer_disposal_due_id = rdd.id

UNION ALL

-- Direct retailer -> company disposal dues (no business chain)
SELECT 
    NULL as consumer_due_id,
    NULL as consumer_id,
    NULL as consumer_amount,
    NULL as consumer_status,
    NULL as consumer_due_date,
    
    NULL as business_due_id,
    NULL as business_id,
    NULL as business_amount,
    NULL as business_status,
    NULL as business_due_date,
    
    rdd.id as retailer_due_id,
    rdd.retailer_id,
    rdd.amount as retailer_amount,
    rdd.status as retailer_status,
    rdd.due_date as retailer_due_date,
    rdd.source_type as retailer_source_type,
    
    cmpdd.id as company_due_id,
    cmpdd.company_id,
    cmpdd.amount as company_amount,
    cmpdd.status as company_status,
    cmpdd.due_date as company_due_date,
    cmpdd.source_type as company_source_type,
    
    'direct_retailer_company' as flow_stage
    
FROM retailer_disposal_dues rdd
LEFT JOIN company_disposal_dues cmpdd ON cmpdd.retailer_disposal_due_id = rdd.id
WHERE rdd.business_disposal_due_id IS NULL AND rdd.source_type = 'company_purchase'

ORDER BY COALESCE(consumer_due_id, retailer_due_id);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_consumer_disposal_dues_status ON consumer_disposal_dues(status);
CREATE INDEX IF NOT EXISTS idx_business_disposal_dues_status ON business_disposal_dues(status);
CREATE INDEX IF NOT EXISTS idx_retailer_disposal_dues_status ON retailer_disposal_dues(status);
CREATE INDEX IF NOT EXISTS idx_company_disposal_dues_status ON company_disposal_dues(status);

CREATE INDEX IF NOT EXISTS idx_consumer_disposal_dues_transaction ON consumer_disposal_dues(transaction_id);
CREATE INDEX IF NOT EXISTS idx_business_disposal_dues_consumer ON business_disposal_dues(consumer_disposal_due_id);
CREATE INDEX IF NOT EXISTS idx_retailer_disposal_dues_business ON retailer_disposal_dues(business_disposal_due_id);
CREATE INDEX IF NOT EXISTS idx_retailer_disposal_dues_source_type ON retailer_disposal_dues(source_type);
CREATE INDEX IF NOT EXISTS idx_company_disposal_dues_retailer ON company_disposal_dues(retailer_disposal_due_id);
CREATE INDEX IF NOT EXISTS idx_company_disposal_dues_source_type ON company_disposal_dues(source_type);