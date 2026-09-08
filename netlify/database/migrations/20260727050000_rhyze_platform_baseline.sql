-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClassIntensity" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'ALL_LEVELS');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'LATE_CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'PROMOTED', 'LEFT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CHECKED_IN', 'ATTENDED', 'NO_SHOW', 'LATE_CANCELLED');

-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('GRANT', 'RESERVE', 'CONSUME', 'RELEASE', 'RESTORE', 'EXPIRE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('INTRO_TRIAL', 'MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'CLASS_PACK', 'DROP_IN', 'VIP');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "CommerceOrderKind" AS ENUM ('MERCHANDISE', 'EVENT');

-- CreateEnum
CREATE TYPE "CommerceOrderStatus" AS ENUM ('PENDING', 'PAID', 'PAYMENT_FAILED', 'FULFILLMENT_REVIEW', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentRecordKind" AS ENUM ('PRODUCT_PURCHASE', 'MEMBERSHIP_RENEWAL', 'MERCHANDISE', 'EVENT', 'TRANSFER_FEE');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MembershipChangeRequestType" AS ENUM ('CHANGE', 'CANCEL');

-- CreateEnum
CREATE TYPE "MembershipChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'RECEIVED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstructorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('INSURANCE', 'CPR');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('UNDER_REVIEW', 'VALID', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'EARNED', 'REVERSED', 'PAID');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('COMPLETED', 'PAYMENT_FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTemplate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "intensity" "ClassIntensity" NOT NULL DEFAULT 'ALL_LEVELS',
    "defaultCapacity" INTEGER NOT NULL,
    "dropInPriceCents" INTEGER,
    "tags" TEXT[],
    "equipment" TEXT[],
    "cancellationPolicy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEvent" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSeries" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "instructorId" TEXT,
    "roomId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "recurrenceRule" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "priceCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassOccurrence" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "seriesId" TEXT,
    "instructorId" TEXT,
    "roomId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "capacity" INTEGER NOT NULL,
    "priceCents" INTEGER,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "publicNotes" TEXT,
    "internalNotes" TEXT,
    "cancellationReason" TEXT,
    "historicalSignupCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMessage" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'UPDATE',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberConversation" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "memberReadAt" TIMESTAMP(3),
    "managementReadAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" TEXT NOT NULL DEFAULT 'MEMBER',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTransfer" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "fromOccurrenceId" TEXT NOT NULL,
    "toOccurrenceId" TEXT,
    "status" "TransferStatus" NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "stripePaymentIntentId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "bookingId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "markedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourcePurchaseId" TEXT,
    "label" TEXT NOT NULL,
    "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "bookingId" TEXT,
    "sourceStripeInvoiceId" TEXT,
    "type" "CreditEntryType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'ONE_TIME',
    "includedCredits" INTEGER,
    "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
    "eligibleCategoryIds" TEXT[],
    "trialDays" INTEGER,
    "cancellationPolicy" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availabilityStart" TIMESTAMP(3),
    "availabilityEnd" TIMESTAMP(3),
    "alwaysAvailable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "customPlanType" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "status" "MembershipStatus" NOT NULL,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "type" "MembershipChangeRequestType" NOT NULL,
    "requestedProductId" TEXT,
    "memberNote" TEXT,
    "status" "MembershipChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "occurrenceId" TEXT,
    "kind" "CommerceOrderKind" NOT NULL,
    "status" "CommerceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "customerEmail" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommerceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productReference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "variant" TEXT,
    "imageUrl" TEXT,
    "unitAmountCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CommerceOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purchaseId" TEXT,
    "membershipId" TEXT,
    "commerceOrderId" TEXT,
    "kind" "PaymentRecordKind" NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeEventId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeSubscriptionId" TEXT,
    "receiptUrl" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "receiptUrl" TEXT,
    "stripeInvoiceId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
    "from" TEXT,
    "to" TEXT NOT NULL,
    "toList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "headers" JSONB,
    "messageId" TEXT,
    "threadId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "providerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "resendAttachmentId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentDisposition" TEXT,
    "contentId" TEXT,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResendWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "payload" JSONB NOT NULL,
    "processingAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResendWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "body" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "oauth_token_secret" TEXT,
    "oauth_token" TEXT,
    "refresh_token_expires_in" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredName" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "dateOfBirth" TIMESTAMP(3),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canEditOwnProfile" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorCredential" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InstructorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommission" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'EARNED',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionalEmail" BOOLEAN NOT NULL DEFAULT true,
    "classReminders" BOOLEAN NOT NULL DEFAULT true,
    "marketingEmail" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "requiresSign" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaiverVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverAcceptance" (
    "id" TEXT NOT NULL,
    "waiverVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedDate" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "mediaConsent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WaiverAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'website-footer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SombleClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "lastWorkoutAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "sourceJoinedAt" TIMESTAMP(3) NOT NULL,
    "totalWorkouts" INTEGER NOT NULL DEFAULT 0,
    "appDownloaded" BOOLEAN NOT NULL DEFAULT false,
    "birthday" TIMESTAMP(3),
    "sourceFile" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SombleClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SombleTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "supporterName" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SombleTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClassCategory_slug_key" ON "ClassCategory"("slug");

-- CreateIndex
CREATE INDEX "ClassCategory_isActive_name_idx" ON "ClassCategory"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTemplate_slug_key" ON "ClassTemplate"("slug");

-- CreateIndex
CREATE INDEX "ClassTemplate_categoryId_isActive_idx" ON "ClassTemplate"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "ClassTemplate_archivedAt_idx" ON "ClassTemplate"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_locationId_name_key" ON "Room"("locationId", "name");

-- CreateIndex
CREATE INDEX "ClassSeries_templateId_isActive_idx" ON "ClassSeries"("templateId", "isActive");

-- CreateIndex
CREATE INDEX "ClassSeries_instructorId_startsAt_idx" ON "ClassSeries"("instructorId", "startsAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_startAt_status_idx" ON "ClassOccurrence"("startAt", "status");

-- CreateIndex
CREATE INDEX "ClassOccurrence_instructorId_startAt_endAt_idx" ON "ClassOccurrence"("instructorId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_roomId_startAt_endAt_idx" ON "ClassOccurrence"("roomId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_templateId_startAt_idx" ON "ClassOccurrence"("templateId", "startAt");

-- CreateIndex
CREATE INDEX "ClassOccurrence_seriesId_startAt_idx" ON "ClassOccurrence"("seriesId", "startAt");

-- CreateIndex
CREATE INDEX "ClassMessage_occurrenceId_createdAt_idx" ON "ClassMessage"("occurrenceId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassMessage_instructorId_createdAt_idx" ON "ClassMessage"("instructorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InAppNotification_dedupeKey_key" ON "InAppNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "InAppNotification_userId_readAt_createdAt_idx" ON "InAppNotification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberConversation_memberId_key" ON "MemberConversation"("memberId");

-- CreateIndex
CREATE INDEX "MemberConversation_updatedAt_idx" ON "MemberConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "MemberConversationMessage_conversationId_createdAt_idx" ON "MemberConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberConversationMessage_senderId_createdAt_idx" ON "MemberConversationMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberConversationMessage_conversationId_memberReadAt_idx" ON "MemberConversationMessage"("conversationId", "memberReadAt");

-- CreateIndex
CREATE INDEX "MemberConversationMessage_conversationId_managementReadAt_idx" ON "MemberConversationMessage"("conversationId", "managementReadAt");

-- CreateIndex
CREATE INDEX "Booking_userId_status_bookedAt_idx" ON "Booking"("userId", "status", "bookedAt");

-- CreateIndex
CREATE INDEX "Booking_occurrenceId_status_idx" ON "Booking"("occurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_occurrenceId_userId_key" ON "Booking"("occurrenceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingTransfer_stripePaymentIntentId_key" ON "BookingTransfer"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "BookingTransfer_bookingId_createdAt_idx" ON "BookingTransfer"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingTransfer_instructorId_createdAt_idx" ON "BookingTransfer"("instructorId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingTransfer_memberId_createdAt_idx" ON "BookingTransfer"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_occurrenceId_status_joinedAt_idx" ON "WaitlistEntry"("occurrenceId", "status", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_occurrenceId_userId_key" ON "WaitlistEntry"("occurrenceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_bookingId_key" ON "AttendanceRecord"("bookingId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_occurrenceId_status_idx" ON "AttendanceRecord"("occurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_occurrenceId_userId_key" ON "AttendanceRecord"("occurrenceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_sourcePurchaseId_key" ON "CreditAccount"("sourcePurchaseId");

-- CreateIndex
CREATE INDEX "CreditAccount_userId_validUntil_idx" ON "CreditAccount"("userId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_sourceStripeInvoiceId_key" ON "CreditLedgerEntry"("sourceStripeInvoiceId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_creditAccountId_createdAt_idx" ON "CreditLedgerEntry"("creditAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_bookingId_idx" ON "CreditLedgerEntry"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_stripePriceId_key" ON "Product"("stripePriceId");

-- CreateIndex
CREATE INDEX "Product_isActive_isPublic_kind_idx" ON "Product"("isActive", "isPublic", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripeCheckoutSessionId_key" ON "Purchase"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_stripePaymentIntentId_key" ON "Purchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Purchase_userId_status_createdAt_idx" ON "Purchase"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_status_createdAt_idx" ON "Purchase"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_purchaseId_key" ON "Membership"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_stripeSubscriptionId_key" ON "Membership"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Membership_userId_status_currentPeriodEnd_idx" ON "Membership"("userId", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "MembershipChangeRequest_userId_status_createdAt_idx" ON "MembershipChangeRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipChangeRequest_membershipId_status_idx" ON "MembershipChangeRequest"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceOrder_stripeCheckoutSessionId_key" ON "CommerceOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceOrder_stripePaymentIntentId_key" ON "CommerceOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "CommerceOrder_status_createdAt_idx" ON "CommerceOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_userId_createdAt_idx" ON "CommerceOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommerceOrder_occurrenceId_status_idx" ON "CommerceOrder"("occurrenceId", "status");

-- CreateIndex
CREATE INDEX "CommerceOrderItem_orderId_idx" ON "CommerceOrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripeEventId_key" ON "PaymentRecord"("stripeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripeCheckoutSessionId_key" ON "PaymentRecord"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripePaymentIntentId_key" ON "PaymentRecord"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripeInvoiceId_key" ON "PaymentRecord"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "PaymentRecord_status_occurredAt_idx" ON "PaymentRecord"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_userId_occurredAt_idx" ON "PaymentRecord"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_stripeSubscriptionId_occurredAt_idx" ON "PaymentRecord"("stripeSubscriptionId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_purchaseId_key" ON "Invoice"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- CreateIndex
CREATE INDEX "Refund_purchaseId_createdAt_idx" ON "Refund"("purchaseId", "createdAt");

-- CreateIndex
CREATE INDEX "StripeEvent_type_createdAt_idx" ON "StripeEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_providerId_key" ON "EmailMessage"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_dedupeKey_key" ON "EmailMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailMessage_status_scheduledFor_idx" ON "EmailMessage"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "EmailMessage_userId_createdAt_idx" ON "EmailMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_direction_createdAt_idx" ON "EmailMessage"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_createdAt_idx" ON "EmailMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailAttachment_emailMessageId_createdAt_idx" ON "EmailAttachment"("emailMessageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAttachment_emailMessageId_resendAttachmentId_key" ON "EmailAttachment"("emailMessageId", "resendAttachmentId");

-- CreateIndex
CREATE INDEX "ResendWebhookEvent_type_createdAt_idx" ON "ResendWebhookEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ResendWebhookEvent_resendEmailId_createdAt_idx" ON "ResendWebhookEvent"("resendEmailId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_status_scheduledFor_idx" ON "EmailCampaign"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_userId_key" ON "MemberProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorProfile_userId_key" ON "InstructorProfile"("userId");

-- CreateIndex
CREATE INDEX "InstructorCredential_instructorId_type_status_idx" ON "InstructorCredential"("instructorId", "type", "status");

-- CreateIndex
CREATE INDEX "InstructorCredential_expiresAt_status_idx" ON "InstructorCredential"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorApplication_userId_key" ON "InstructorApplication"("userId");

-- CreateIndex
CREATE INDEX "InstructorApplication_status_createdAt_idx" ON "InstructorApplication"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_instructorId_isActive_idx" ON "ReferralCode"("instructorId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAttribution_referredUserId_key" ON "ReferralAttribution"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referralCodeId_createdAt_idx" ON "ReferralAttribution"("referralCodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_userId_key" ON "DiscountRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_purchaseId_key" ON "DiscountRedemption"("purchaseId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_referralCodeId_createdAt_idx" ON "DiscountRedemption"("referralCodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommission_referredUserId_key" ON "ReferralCommission"("referredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommission_purchaseId_key" ON "ReferralCommission"("purchaseId");

-- CreateIndex
CREATE INDEX "ReferralCommission_instructorId_status_earnedAt_idx" ON "ReferralCommission"("instructorId", "status", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaiverVersion_version_key" ON "WaiverVersion"("version");

-- CreateIndex
CREATE INDEX "WaiverVersion_isActive_effectiveAt_idx" ON "WaiverVersion"("isActive", "effectiveAt");

-- CreateIndex
CREATE INDEX "WaiverAcceptance_userId_acceptedAt_idx" ON "WaiverAcceptance"("userId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaiverAcceptance_waiverVersionId_userId_key" ON "WaiverAcceptance"("waiverVersionId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterLead_email_key" ON "NewsletterLead"("email");

-- CreateIndex
CREATE INDEX "NewsletterLead_createdAt_idx" ON "NewsletterLead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SombleClientProfile_userId_key" ON "SombleClientProfile"("userId");

-- CreateIndex
CREATE INDEX "SombleClientProfile_sourceStatus_idx" ON "SombleClientProfile"("sourceStatus");

-- CreateIndex
CREATE INDEX "SombleClientProfile_sourceJoinedAt_idx" ON "SombleClientProfile"("sourceJoinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SombleTransaction_transferId_key" ON "SombleTransaction"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "SombleTransaction_paymentId_key" ON "SombleTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "SombleTransaction_transferredAt_idx" ON "SombleTransaction"("transferredAt");

-- CreateIndex
CREATE INDEX "SombleTransaction_contentType_transferredAt_idx" ON "SombleTransaction"("contentType", "transferredAt");

-- CreateIndex
CREATE INDEX "SombleTransaction_userId_transferredAt_idx" ON "SombleTransaction"("userId", "transferredAt");

-- AddForeignKey
ALTER TABLE "ClassTemplate" ADD CONSTRAINT "ClassTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClassCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSeries" ADD CONSTRAINT "ClassSeries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMessage" ADD CONSTRAINT "ClassMessage_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMessage" ADD CONSTRAINT "ClassMessage_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberConversation" ADD CONSTRAINT "MemberConversation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberConversationMessage" ADD CONSTRAINT "MemberConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MemberConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberConversationMessage" ADD CONSTRAINT "MemberConversationMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_sourcePurchaseId_fkey" FOREIGN KEY ("sourcePurchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipChangeRequest" ADD CONSTRAINT "MembershipChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipChangeRequest" ADD CONSTRAINT "MembershipChangeRequest_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipChangeRequest" ADD CONSTRAINT "MembershipChangeRequest_requestedProductId_fkey" FOREIGN KEY ("requestedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipChangeRequest" ADD CONSTRAINT "MembershipChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceOrderItem" ADD CONSTRAINT "CommerceOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommerceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_commerceOrderId_fkey" FOREIGN KEY ("commerceOrderId") REFERENCES "CommerceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorCredential" ADD CONSTRAINT "InstructorCredential_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorCredential" ADD CONSTRAINT "InstructorCredential_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorApplication" ADD CONSTRAINT "InstructorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorApplication" ADD CONSTRAINT "InstructorApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverAcceptance" ADD CONSTRAINT "WaiverAcceptance_waiverVersionId_fkey" FOREIGN KEY ("waiverVersionId") REFERENCES "WaiverVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverAcceptance" ADD CONSTRAINT "WaiverAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SombleClientProfile" ADD CONSTRAINT "SombleClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SombleTransaction" ADD CONSTRAINT "SombleTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

