UPDATE "Product"
SET "description" = 'Activates when first class is booked
Expires automatically 7 days after first booked class
Unlimited standard classes during the trial window
Specialty events and workshops excluded
First-time clients only'
WHERE "slug" = 'intro-offer';

UPDATE "Product"
SET "description" = '8 standard class credits per month
Auto-renews monthly
Specialty events and workshops excluded
Unique member promo code for 15% off Rhyze merchandise
Credits do not roll over'
WHERE "slug" = 'ritual';

UPDATE "Product"
SET "description" = '4 standard class credits per month
Auto-renews monthly
Specialty events and workshops excluded
Unique member promo code for 10% off Rhyze merchandise
Credits do not roll over'
WHERE "slug" = 'elevate';

UPDATE "Product"
SET "description" = 'Founding members lock in $199/month for life
Unlimited standard classes
1 eligible specialty event per month
Eligible event choices are announced monthly
Unique member promo code for 20% off Rhyze merchandise'
WHERE "slug" = 'vip-access-pass';
