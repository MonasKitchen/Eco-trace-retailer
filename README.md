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
