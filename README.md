Supabase Auth Handles user, business, retailer, and company accounts

Supports email/password, OAuth, OTP, etc.

Supabase Database (Postgres Tables) users: { id, name, income,
plastic_limit, current_usage } businesses: { id, owner_id (FK users),
type, verification_status } retailers: { id, name, registered_businesses
int\[\] } companies: { id, name, disposal_rates jsonb } products: { id,
name, category, disposal_cost, retailer_id (FK retailers) }
transactions: { id, user_id, product_id, timestamp, cost_paid }
business_transactions: { id, business_id, product_id, timestamp, status
} retailer_transactions: { id, retailer_id, business_id, amount,
timestamp } company_payments: { id, company_id, retailer_id, amount,
timestamp } disposal_dues: { id, business_id, amount, due_date }
environmental_reports: { id, company_id, report_data jsonb, generated_at
}

Supabase Storage For document uploads (income certificate, business
verification docs)

Organized buckets:

/user_docs/

/business_docs/

Supabase Functions (Edge Functions) calculateDisposalCost -- Compute
disposal cost based on product type

checkUsageLimit -- Block user purchase if over plastic limit

processPaymentChain -- Business → Retailer → Company settlement

generateReports -- Monthly usage/environmental reports

sendNotifications -- Email/Push notifications via Supabase + Expo

Supabase Policies (RLS) Users: can only SELECT/UPDATE their own row

Businesses: can update their own transactions only

Retailers: can SELECT businesses linked to them

Companies: can access aggregated reports only

📱 Unit 1: Consumer App (React Native + Supabase) Screens: AuthScreen --
Supabase Auth sign-in/register

DocumentUploadScreen -- Upload docs → Supabase Storage

HomeScreen -- Dashboard (plastic usage stats from transactions)

QRScannerScreen -- Scan QR → fetch product details from products

ProductDetailsScreen -- Show product info + disposal cost

UsageLimitScreen -- Compare current_usage vs plastic_limit

TransactionHistoryScreen -- Show past purchases (transactions)

ProfileScreen -- Update profile settings

📱 Unit 2: Business/Shopkeeper App Screens: AuthScreen

BusinessVerificationScreen (upload docs → Supabase Storage)

HomeScreen (pending payments summary)

ProductScanScreen (scan product before selling)

CustomerVerificationScreen (verify scanned QR vs user)

DisposalCostScreen (view owed disposal costs from disposal_dues)

PaymentScreen (pay dues → Razorpay/Stripe API)

SalesHistoryScreen (business_transactions)

📱 Unit 3: Retailer App Screens: AuthScreen

HomeScreen (collection summary)

BusinessListScreen (businesses linked to retailer)

DisposalCollectionScreen (collect payments → retailer_transactions)

ProductManagementScreen (manage products + disposal costs)

PaymentToCompanyScreen (company_payments)

ReportsScreen (reports from generateReports)

📱 Unit 4: Plastic Company App Screens: AuthScreen

HomeScreen (collection summary from retailers)

RetailerListScreen (all registered retailers)

PaymentCollectionScreen (collect from retailers)

ProductCatalogScreen (manage disposal rates in companies)

AnalyticsScreen (plastic usage trends from transactions)

ComplianceScreen (environmental_reports)
