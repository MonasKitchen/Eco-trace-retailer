1 : Users

id (uuid, PK)

email (text, unique, required)

name (text, required)

user_type (enum: company | admin | business | retailer | consumer)

created_at (timestamptz, default now)

updated_at (timestamptz, default now)

Businesses

id (uuid, PK)

owner_id (uuid, FK → users.id)

name (text, required)

type (text, required)

verification_status (enum: pending | approved | rejected, default: pending)

created_at, updated_at (timestamptz, default now)

approved_at, rejected_at (timestamptz)

admin_notes (text)

Companies

id (uuid, PK)

user_id (uuid, FK → users.id)

name (text, required)

contact_person (text, required)

email (text, required)

phone_number, address (text)

registration_date (timestamptz, default now)

verification_status (enum: pending | approved | rejected, default: pending)

disposal_rates (jsonb, default {})

total_disposal_collected (numeric, default 0)

disposal_processing_capacity (numeric, default 0)

disposal_license_number (text)

disposal_license_expiry (date)

created_at, updated_at (timestamptz, default now)

approved_at, rejected_at (timestamptz)

admin_notes (text)

Company Products

id (uuid, PK)

name (text, required)

category (text, required)

disposal_cost (numeric, required)

retailer_id (uuid, FK → retailers.id)

company_id (uuid, FK → companies.id)

qr_code_url, qr_data (text)

created_at, updated_at (timestamptz, default now)

Retailers

id (uuid, PK)

user_id (uuid, FK → users.id)

name (text, required)

registered_businesses (array, default empty)

email, location (text, required)

address, phone_number (text)

verification_status (enum: pending | approved | rejected, default pending)

created_at, updated_at (timestamptz, default now)

approved_at, rejected_at (timestamptz)

admin_notes (text)

Retailer Inventory

id (uuid, PK)

company_product_id (uuid, FK → company_products.id)

retailer_id (uuid, FK → retailers.id)

quantity (int, default 0)

unit_price (numeric, required)

status (enum: available | out_of_stock | discontinued, default available)

plastic_quantity_grams (numeric, default 0)

plastic_cost_per_gram (numeric, default 0.10)

total_plastic_cost (numeric, default 0)

product_name, product_category, product_description (text)

is_custom_product (boolean, default false)

created_at, updated_at (timestamptz, default now)

Business Transactions

id (uuid, PK)

business_id (uuid, FK → businesses.id)

product_id (uuid)

inventory_id (uuid, FK → retailer_inventory.id)

timestamp (timestamptz, default now)

status (enum: pending | completed | cancelled, default pending)

created_at (timestamptz, default now)

Inventory Transactions

id (uuid, PK)

inventory_id (uuid, FK → retailer_inventory.id)

business_id (uuid, FK → businesses.id)

quantity (int, required)

transaction_type (enum: purchase | return | adjustment)

unit_price (numeric, required)

total_amount (numeric, required)

plastic_quantity_purchased (numeric, default 0)

plastic_disposal_cost (numeric, default 0)

timestamp, created_at (timestamptz, default now)

Retailer Transactions

id (uuid, PK)

retailer_id (uuid, FK → retailers.id)

business_id (uuid, FK → businesses.id)

amount (numeric, required)

timestamp, created_at (timestamptz, default now)

Transactions (Consumer Purchases)

id (uuid, PK)

user_id (uuid, FK → users.id)

product_id (uuid)

inventory_id (uuid, FK → retailer_inventory.id)

cost_paid (numeric, required)

plastic_disposal_fee (numeric, default 0)

timestamp, created_at (timestamptz, default now)

Company Payments

id (uuid, PK)

company_id (uuid, FK → companies.id)

retailer_id (uuid, FK → retailers.id)

amount (numeric, required)

status (enum: pending | completed | failed, default pending)

timestamp, created_at (timestamptz, default now)

Consumer Disposal Dues

id (uuid, PK)

consumer_id (uuid, FK → users.id)

transaction_id (uuid, FK → transactions.id)

amount (numeric, required)

due_date (date, required)

status (enum: pending | paid | overdue, default pending)

created_at (timestamptz, default now)

Business Disposal Dues

id (uuid, PK)

business_id (uuid, FK → businesses.id)

consumer_disposal_due_id (uuid, FK → consumer_disposal_dues.id)

amount (numeric, required)

due_date (date, required)

status (enum: pending | paid | overdue, default pending)

created_at (timestamptz, default now)

Retailer Disposal Dues

id (uuid, PK)

retailer_id (uuid, FK → retailers.id)

business_disposal_due_id (uuid, FK → business_disposal_dues.id)

amount (numeric, required)

due_date (date, required)

status (enum: pending | paid | overdue, default pending)

created_at (timestamptz, default now)

Company Disposal Dues

id (uuid, PK)

company_id (uuid, FK → companies.id)

retailer_disposal_due_id (uuid, FK → retailer_disposal_dues.id)

amount (numeric, required)

due_date (date, required)

status (enum: pending | paid | overdue, default pending)

created_at (timestamptz, default now)

Environmental Reports

id (uuid, PK)

company_id (uuid, FK → companies.id)

report_data (jsonb, required)

generated_at, created_at (timestamptz, default now)