# Member–Management Messaging Design

## Goal

Replace the current one-way notification masquerading as a message with a durable, two-way conversation between each member and Rhyze management. Members must be able to open, read, and reply to messages while seeing the real sender and timestamp. Management must be able to continue the same thread and receive an alert when a member replies.

## Chosen approach

Use one shared management conversation per member. Vanessa, Melissa, and any other approved owner can open and answer that conversation, while each individual message records and displays its actual author. This avoids splitting customer support across separate owner inboxes and preserves accountability.

The existing `InAppNotification` model remains the alert layer for general studio updates. Conversation content is stored separately in `MemberConversation` and `MemberConversationMessage`. Message notifications link to the real thread rather than back to the notification list.

## Data and authorization

- `MemberConversation` belongs to exactly one member and has a current subject plus created/updated timestamps.
- `MemberConversationMessage` belongs to one conversation and one sender. It stores the body, optional subject, creation time, and separate member/management read timestamps.
- Members may only read and reply to the conversation whose `memberId` matches their authenticated user ID.
- Only approved owners may list, read, and reply to management conversations.
- Member replies notify every active approved owner in-app and queue an email to each owner.
- Management replies notify the member in-app and queue an email to the member.

## User experience

- The member notification popup opens `/member/messages`.
- `/member/messages` displays the full conversation in chronological order, with sender name, sender type, local date/time, and a reply form.
- Opening the member thread marks management-authored messages as read.
- The member portal brand area shows a red numeric badge for unread management messages.
- `/admin/messages` gains a Member Conversations section with member name, latest-message preview/time, and unread reply count.
- `/admin/messages/[conversationId]` displays the same chronological thread and a management reply form. Opening it marks member-authored messages as read.
- Existing email queue, class update, and campaign sections remain intact.

## Supporting changes

- Reuse a client-side password input for sign-up and sign-in so both pages provide accessible show/hide controls.
- Replace owner-name-specific membership request copy with “until management reviews it” and align the supporting note with that wording.

## Error handling and testing

- Validate message subjects and bodies server-side.
- Reject missing members/conversations and prevent cross-member access through scoped database queries.
- Keep email delivery asynchronous through the existing email queue.
- Test conversation authorization, unread counting/read transitions, notification destinations, email rendering, sign-in password visibility, and membership copy.
- Verify Prisma validation/generation, type checking, the full test suite, and a production build.
