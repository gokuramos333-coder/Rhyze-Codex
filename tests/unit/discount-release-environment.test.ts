import { expect, it } from 'vitest';
import { releaseTestEnvironment } from '@/scripts/release/guards';
const source = {
  ARCHIVE_TEST_DATABASE_URL: 'postgresql://archive_test@localhost:55473/archive_phone_test?host=%2Fprivate%2Ftmp%2Fowned-archive',
  ARCHIVE_TEST_DATABASE_DIR: '/private/tmp/owned-archive/data',
  ARCHIVE_TEST_SOCKET_DIR: '/private/tmp/owned-archive',
 ADMIN_RENEWAL_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/admin_renewal_test',
 ADMIN_RENEWAL_TEST_DATABASE_DIR:'/tmp/owned-discount-pg',
 KELLY_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/kelly_renewal_actions_test',
 KELLY_TEST_DATABASE_DIR:'/tmp/owned-discount-pg',
 TRIAL_TEST_DATABASE_DIR:'/tmp/owned-discount-pg',
 DATABASE_URL:'postgresql://tester@127.0.0.1:55439/callback_test',
 CALLBACK_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/callback_test',
 IDENTITY_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/identity_migration',
 VIP_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/identity_migration',
 PLAN_CHANGE_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/membership_plan_test',
 NEWSLETTER_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/rhyze_newsletter_preview',
 DISCOUNT_TEST_DATABASE_URL:'postgresql://tester@127.0.0.1:55439/discount_campaign_test',
 DISCOUNT_TEST_DATA_DIRECTORY:'/tmp/owned-discount-pg',
};
it('preserves explicit discount identity through the real release builder, never provider secrets',()=>{
 const env=releaseTestEnvironment({...source,STRIPE_SECRET_KEY:'must-not-inherit'});
 expect(env.DISCOUNT_TEST_DATABASE_URL).toBe(source.DISCOUNT_TEST_DATABASE_URL);
 expect(env.DISCOUNT_TEST_DATA_DIRECTORY).toBe(source.DISCOUNT_TEST_DATA_DIRECTORY);
 expect(env.STRIPE_SECRET_KEY).toBeUndefined();
});
it.each([undefined,'','relative/pg','/','/tmp/../pg'])('rejects unsafe or missing owned directory %s',dir=>{
 expect(()=>releaseTestEnvironment({...source,DISCOUNT_TEST_DATA_DIRECTORY:dir})).toThrow();
});
it.each(['postgresql://tester@localhost:55439/discount_campaign_test','postgresql://tester@127.0.0.1/discount_campaign_test','postgresql://tester@127.0.0.1:55439/callback_test','postgresql://tester@127.0.0.1:55439/discount_campaign_test?host=remote','postgresql://tester@127.0.0.1:55439/discount_campaign_test#override'])('rejects unsafe discount URL %s',url=>{
 expect(()=>releaseTestEnvironment({...source,DISCOUNT_TEST_DATABASE_URL:url})).toThrow();
});
