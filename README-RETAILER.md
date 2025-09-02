# EcoTrace Retailer App - Inventory Management Flow

## Overview

This document explains the updated flow for the EcoTrace Retailer app, which now properly implements the inventory management system where retailers add inventory items that reference company products.

## Flow Diagram

Based on the `eraser_diagram.txt`, the flow is:

1. **Companies** (plastic companies) create product templates with disposal costs
2. **Retailers** add inventory items that reference these company products
3. **Businesses** purchase from retailers
4. **Consumers** scan QR codes and pay disposal costs

## Database Schema Changes

The following schema changes have been implemented in `schema-changes.sql`:

### 1. Table Renaming
- `products` → `company_products` (these are the templates from companies)

### 2. New Tables
- `retailer_inventory` - tracks inventory items with quantities and prices
- `inventory_transactions` - tracks stock movements and purchases

### 3. Updated References
- `business_transactions` now references `retailer_inventory` instead of `products`
- `transactions` now references `retailer_inventory` instead of `products`

## Implementation Details

### Retailer Inventory Management (`app/(tabs)/products.tsx`)

The products screen has been completely refactored to:

1. **Show Current Inventory**: Displays all inventory items with quantities and status
2. **Add New Items**: Allows retailers to select from company products and set quantities/prices
3. **Manage Stock**: Provides +/- buttons to adjust inventory quantities
4. **View Company Products**: Shows available products from verified companies

### Key Features

- **Inventory Tracking**: Real-time quantity management
- **Product Selection**: Dropdown to select from company products
- **Stock Management**: Easy quantity adjustments
- **Status Management**: Track availability, out-of-stock, discontinued items

## How to Use

### For Retailers

1. **View Inventory**: See all current inventory items with stock levels
2. **Add Items**: 
   - Click "Add Item" button
   - Select a company product from the dropdown
   - Set quantity and unit price
   - Save to inventory
3. **Manage Stock**: Use +/- buttons to adjust quantities
4. **Monitor Status**: Track item availability and stock levels

### For Businesses

1. **View Available Items**: See what retailers have in stock
2. **Make Purchases**: Buy items which automatically updates inventory
3. **Track Transactions**: Monitor purchase history and disposal costs

## Database Setup

To implement this flow, run the following SQL commands:

```sql
-- Apply the schema changes
\i schema-changes.sql

-- Or manually run the commands from the file
```

## API Endpoints

The following Supabase tables are used:

- `company_products` - Product templates from companies
- `retailer_inventory` - Retailer's inventory items
- `inventory_transactions` - Stock movements and purchases
- `businesses` - Business customers
- `retailers` - Retailer profiles

## Security

Row Level Security (RLS) policies ensure:
- Retailers can only see and manage their own inventory
- Businesses can only see their own transactions
- Companies can only see their own products

## Testing

To test the flow:

1. **Create Company Products**: Add products to `company_products` table
2. **Add Inventory**: Use the app to add inventory items
3. **Simulate Purchases**: Create transactions to test stock updates
4. **Verify Flow**: Ensure disposal costs flow correctly through the system

## Future Enhancements

- **QR Code Generation**: Generate QR codes for inventory items
- **Barcode Scanning**: Support for barcode scanning
- **Automated Reordering**: Low stock alerts and reorder suggestions
- **Analytics**: Sales reports and inventory analytics
- **Multi-location Support**: Multiple warehouse/store locations

## Troubleshooting

### Common Issues

1. **Inventory Not Loading**: Check retailer profile exists
2. **Can't Add Items**: Verify company products are verified
3. **Stock Updates Fail**: Check RLS policies and permissions

### Debug Steps

1. Check Supabase logs for errors
2. Verify user authentication
3. Check table permissions and RLS policies
4. Validate data relationships

## Support

For technical support or questions about the implementation, refer to:
- Database schema: `schema-changes.sql`
- App implementation: `app/(tabs)/products.tsx`
- Flow diagram: `eraser_diagram.txt`