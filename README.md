# EcoTrace Retailer App

A React Native mobile application for plastic waste management retailers built with Expo and Supabase.

## Features

### Dashboard & Profile Management
- Real-time dashboard showing collection summary, pending payments, and business metrics
- Retailer profile management with business verification status
- Monthly revenue tracking and business count monitoring
- Smart notifications for overdue payments, low inventory, and company obligations

### Inventory Management
- Create custom products using purchased plastic materials
- Track plastic material inventory from verified companies
- Real-time stock level monitoring with automatic status updates
- Plastic cost calculation per product with disposal cost tracking
- Inventory value and plastic cost analytics

### Company Integration
- Browse verified plastic companies and their products
- Purchase plastic materials directly from companies
- Automatic disposal due creation for company purchases
- Company payment tracking and audit trails

### Disposal Dues Tracking
- Monitor plastic disposal payment obligations
- Track pending, overdue, and paid disposal dues
- Automatic status updates based on due dates
- Payment confirmation and reminder system
- Disposal due flow from business purchases to company obligations

### Business Relationships
- Manage registered business partnerships
- Track business purchase transactions
- Monitor disposal obligations from business sales
- Business verification and registration tracking

### Transaction Management
- Complete purchase flow with inventory updates
- Automatic disposal cost calculations
- Transaction history and audit trails
- Real-time inventory quantity adjustments

### Payment Processing
- Mark disposal payments as received
- Send payment reminders to businesses
- Track payment status across the disposal chain
- Company payment obligations management

## Technology Stack

- **Frontend**: React Native with Expo
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Backend**: Supabase (PostgreSQL database)
- **Navigation**: Expo Router
- **Icons**: Expo Vector Icons
- **State Management**: React Hooks

## Database Integration

The app integrates with a comprehensive PostgreSQL schema including:
- Retailer inventory and product management
- Company and business relationship tracking
- Disposal dues flow automation with triggers
- Transaction and payment processing
- Environmental compliance tracking

## User Interface

- Tab-based navigation with dedicated screens for:
  - Dashboard with real-time metrics
  - Disposal dues management
  - Company browsing and purchasing
  - Product inventory management
- Modal-based forms for data entry
- Pull-to-refresh functionality
- Real-time data updates and notifications