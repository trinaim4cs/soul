/**
 * SOUL's policies, shown in the app and on the website at `/legal/<id>` (DECISIONS D-029, C-23).
 *
 * DRAFT TEXT: every document requires final human and legal review before public release.
 * Nothing here is legal advice or a statement of legal compliance. Bracketed values such as
 * [Operator legal name] are placeholders the owner must fill in.
 *
 * Changing any document that people accept (community, terms, privacy) needs a new
 * TERMS_VERSION and a migration that updates `app_config.current_terms_version` to match, so
 * existing accounts are asked to accept again.
 */
export const TERMS_VERSION = '2026-09-27-draft-2';
export const DOCUMENTS_ARE_DRAFT = true;
export const DRAFT_LABEL = 'DRAFT — REQUIRES FINAL HUMAN/LEGAL REVIEW';

export type LegalDocumentId =
  | 'community'
  | 'terms'
  | 'privacy'
  | 'eligibility'
  | 'instant'
  | 'verification'
  | 'retention'
  | 'purchases';

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  sections: { heading: string; body: string }[];
};

/** Display order for the policy list. */
export const LEGAL_DOCUMENT_ORDER: LegalDocumentId[] = [
  'community',
  'terms',
  'privacy',
  'eligibility',
  'verification',
  'instant',
  'purchases',
  'retention',
];

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  community: {
    id: 'community',
    title: 'Community and safety rules',
    sections: [
      {
        heading: 'Only for SRM',
        body: 'SOUL is for current SRMIST students aged 18 or older, signed in with their own SRMIST email. One account per person.',
      },
      {
        heading: 'Be yourself',
        body: 'Use recent photos that clearly show you. No fake accounts, no pretending to be someone else, and no photos of other people without their consent.',
      },
      {
        heading: 'Consent comes first',
        body: '"No", no reply and unmatching all mean no. Do not keep messaging someone who has stopped replying or asked you to stop.',
      },
      {
        heading: 'Zero tolerance',
        body: "Harassment, threats, stalking, hate, sexual content sent without consent, anything involving minors, scams, selling or promotion, sharing someone's private details, and recording or screenshotting people to shame them are not allowed.",
      },
      {
        heading: 'Meet safely',
        body: 'Meet in busy public places first, tell a friend where you are going, and arrange your own way home. With Instant Meet, either person can end the meet at any time.',
      },
      {
        heading: 'Report and block',
        body: 'Report or block anyone who breaks these rules, from their profile or the chat. Blocking is immediate and the other person is not told. Reports are reviewed by the SOUL team.',
      },
      {
        heading: 'What happens when rules are broken',
        body: 'Depending on what happened, we may remove content, limit features, suspend or permanently ban the account, and where required by law, report to the authorities. Serious harm leads to an immediate ban.',
      },
      {
        heading: 'In an emergency',
        body: 'If you are in danger, call 112 (India emergency number) first. SOUL cannot send help.',
      },
    ],
  },

  terms: {
    id: 'terms',
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Who we are',
        body: 'SOUL is operated by [Operator legal name], [address] ("SOUL", "we"). By creating an account you agree to these terms, the Community and safety rules, and the Privacy Policy.',
      },
      {
        heading: 'Who can use SOUL',
        body: 'You must be 18 or older, a current SRMIST student, and able to receive email at your own @srmist.edu.in address. You may have one account. See the 18+ eligibility policy.',
      },
      {
        heading: 'Your account',
        body: 'You sign in with a one-time code sent to your SRMIST email. Keep your email account secure; you are responsible for what happens on your SOUL account.',
      },
      {
        heading: 'Your content',
        body: 'You own the photos and text you post. You give SOUL a limited licence to store, display and process them only to run SOUL for you and other eligible users. You must have the right to post what you post.',
      },
      {
        heading: 'Matches, chats and meeting people',
        body: 'SOUL helps you meet other students but cannot guarantee matches or control how others behave. You are responsible for your own interactions, online and in person. SOUL is not a party to any meeting.',
      },
      {
        heading: 'Paid features',
        body: 'Plans and swipe top-ups follow the Subscriptions, top-ups and refunds terms.',
      },
      {
        heading: 'Moderation and ending accounts',
        body: 'We may remove content, limit features, or suspend or end accounts that break these terms or the Community and safety rules, or when eligibility can no longer be confirmed. You can contact us to ask for a review. You can delete your account at any time in Settings.',
      },
      {
        heading: 'Service availability',
        body: 'We work to keep SOUL available and safe but it is provided as is. To the extent the law allows, SOUL is not liable for indirect losses or for the conduct of other users. Nothing in these terms limits rights you have under applicable consumer law.',
      },
      {
        heading: 'Changes',
        body: 'When these terms change in a meaningful way, the app asks you to review and accept the new version before continuing.',
      },
      {
        heading: 'Law and disputes',
        body: 'These terms are governed by the laws of India. Courts at [city] have jurisdiction, subject to any rights you have to bring a claim elsewhere.',
      },
      {
        heading: 'Contact and grievances',
        body: 'Support: [support email]. Grievance Officer: [name or designation], [email], who acknowledges complaints within the time required by law.',
      },
    ],
  },

  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Who is responsible',
        body: '[Operator legal name] decides how your personal data is used in SOUL (the "Data Fiduciary" under India\'s Digital Personal Data Protection Act, 2023). Contact: [privacy email].',
      },
      {
        heading: 'What we collect',
        body: 'Your SRMIST email; your date of birth; your profile (photos, name you choose to show, hook, About Me, gender and who you want to see); likes, passes, matches, messages and reports; Instant Meet location only while a meet is active; purchase records (plan, amount, payment reference); and technical data needed to run the app (app version, push token, error reports).',
      },
      {
        heading: 'What we do not collect',
        body: 'No ID documents, selfies for verification, face scans or other biometric data. No card numbers, UPI PINs or bank details: payments are handled by Razorpay. No location outside Instant Meet. No advertising or third-party analytics trackers.',
      },
      {
        heading: 'What other students see',
        body: 'Your photos, the name you choose, age, hook, About Me, zodiac if you turn it on, the verified SRMIST badge and the Hot Person badge if earned. Never your email, date of birth, exact location or date count. Anonymous and private modes limit this further.',
      },
      {
        heading: 'Why we use your data',
        body: 'To run SOUL (sign-in, profiles, discovery, matching, chat, Instant Meet), keep people safe (moderation, blocking, fraud and abuse prevention), process purchases, and meet legal obligations. We do not sell your data or use it for advertising.',
      },
      {
        heading: 'Service providers',
        body: 'Supabase (database, storage and sign-in; region [to confirm]), Razorpay (payments), Vercel (website hosting), Firebase Cloud Messaging (Android notifications) and the browser push services that deliver web notifications. They process data only to provide their service to SOUL.',
      },
      {
        heading: 'How long we keep it',
        body: 'See the Account deletion and data retention policy.',
      },
      {
        heading: 'Your rights',
        body: 'You can see and edit your profile in the app, withdraw consent by deleting your account, and ask us to access, correct or erase your data, or to nominate someone to act for you, at [privacy email]. You can also raise a complaint with our Grievance Officer and, after that, with the Data Protection Board of India.',
      },
      {
        heading: 'Security',
        body: "Data is encrypted in transit. Your session is stored in the phone's secure storage on Android. Access to data is limited by strict server rules, and staff access is logged.",
      },
      {
        heading: 'Under 18',
        body: 'SOUL is not for anyone under 18. If someone enters a date of birth under 18, we do not store it and no profile is created.',
      },
      {
        heading: 'Changes',
        body: 'When this policy changes in a meaningful way, the app asks you to review the new version.',
      },
    ],
  },

  eligibility: {
    id: 'eligibility',
    title: '18+ eligibility policy',
    sections: [
      {
        heading: 'Who can join',
        body: 'Only people aged 18 or older who are current SRMIST students with their own @srmist.edu.in email.',
      },
      {
        heading: 'How age is checked',
        body: 'You enter your date of birth once, after signing in. Our server checks that you are 18 or older. Your date of birth stays private; your profile shows only your age.',
      },
      {
        heading: 'If you are under 18',
        body: 'SOUL will not create a profile. The date you entered is not stored, and a new date of birth cannot be entered for 30 days.',
      },
      {
        heading: 'Your date of birth cannot be changed',
        body: 'To prevent misuse, the app does not let you change it later. If you made a genuine mistake, contact [support email].',
      },
      {
        heading: 'Reporting a possible minor',
        body: 'If you believe someone on SOUL is under 18, report their profile. We review these reports first and suspend the account while we check.',
      },
      {
        heading: 'False information',
        body: "Giving a false date of birth or using someone else's SRMIST email breaks the Terms and leads to a permanent ban.",
      },
    ],
  },

  verification: {
    id: 'verification',
    title: 'Verification and photo checks',
    sections: [
      {
        heading: 'What SOUL verifies',
        body: 'One thing only: that you control an SRMIST email address. We send a 6-digit code to your @srmist.edu.in address, and entering it proves you can read that inbox.',
      },
      {
        heading: 'What the verified badge means',
        body: 'The badge means "verified SRMIST email". It does not confirm a person\'s name, identity, age or intentions. Stay careful when meeting anyone.',
      },
      {
        heading: 'No ID or face verification',
        body: 'SOUL does not ask for ID documents or verification selfies, does not scan faces, does not use face recognition, and does not match your photos to your identity. No biometric data is collected.',
      },
      {
        heading: 'Profile photos',
        body: 'Your main photo must clearly show your face. Photos may go through automated checks for obvious problems (for example, no face visible or explicit content) and may be reviewed by the SOUL team after a report. These checks look at the photo only; they never identify who is in it.',
      },
    ],
  },

  instant: {
    id: 'instant',
    title: 'Instant Meet and location',
    sections: [
      {
        heading: 'Optional, and off by default',
        body: 'Instant Meet is the only part of SOUL that uses your location. It is included with the Monthly, 3-month and 6-month plans (not the Weekly plan or top-ups). Everything else in SOUL works without location.',
      },
      {
        heading: 'When your location is used',
        body: 'Only while you have Instant Meet turned on and SOUL open. Your phone or browser asks for permission first, and you can say no. SOUL does not track you in the background.',
      },
      {
        heading: 'What others see',
        body: 'Never your coordinates or a map. Our server finds people within 1 km, and only after you both accept a meet does the other person see an approximate distance (for example "about 300 m", or "nearby" under 100 m) and a rough direction.',
      },
      {
        heading: 'Direction on iPhone',
        body: 'Some browsers cannot share the compass. If so, SOUL shows "Direction unavailable on this device" and distance, chat, timer and End Meet keep working.',
      },
      {
        heading: 'Ending a meet',
        body: 'Either person can tap End Meet at any time. Meets also end when their time runs out, and blocking someone ends any meet with them at once.',
      },
      {
        heading: 'What we keep',
        body: 'Your location is deleted when the meet ends. We keep only a record that the meet happened (who and when, with no location) for safety and abuse handling, as described in the retention policy.',
      },
    ],
  },

  purchases: {
    id: 'purchases',
    title: 'Subscriptions, top-ups and refunds',
    sections: [
      {
        heading: 'Free right swipes',
        body: 'Every new account gets 4 free right swipes, once. They do not reset.',
      },
      {
        heading: 'Plans',
        body: 'Weekly ₹69: 15 right swipes, no Instant Meet. Monthly ₹199: 25 right swipes and Instant Meet. 3 months ₹249: 50 right swipes and Instant Meet. 6 months ₹499: 120 right swipes and Instant Meet. Prices are in Indian rupees [inclusive of applicable taxes: to confirm]. The app always shows the current price before you pay.',
      },
      {
        heading: 'Top-ups',
        body: '₹50 for 5, ₹100 for 12 and ₹200 for 25 right swipes. Top-up swipes do not expire and do not unlock Instant Meet.',
      },
      {
        heading: 'How swipes are used',
        body: 'A right swipe is used when you like someone new. Passing is free. Unused plan swipes end with the plan period and do not carry over. Swipes have no cash value and cannot be transferred.',
      },
      {
        heading: 'Paying',
        body: 'Payments are processed by Razorpay. SOUL never sees your card number, UPI PIN or bank details. Your plan or top-up is added to your account after Razorpay confirms the payment to our server, and it works on every device you sign in on.',
      },
      {
        heading: 'Renewal',
        body: '[To confirm: plans are bought for one period at a time and do not renew automatically.] You will always see the end date of your plan in the app.',
      },
      {
        heading: 'Refunds',
        body: 'Failed or duplicate charges are refunded to the original payment method, usually within [5 to 7] working days. Swipes and plan time already used are not refundable, except where the law requires. If a paid feature did not work because of a problem on our side, contact [support email] and we will make it right.',
      },
      {
        heading: 'Bans and account deletion',
        body: 'If an account is banned for breaking the rules, unused swipes and plan time are not refunded. Deleting your account ends any remaining swipes and plan time; the app warns you before you confirm.',
      },
    ],
  },

  retention: {
    id: 'retention',
    title: 'Account deletion and data retention',
    sections: [
      {
        heading: 'Deleting your account',
        body: 'Go to Settings, then Delete account. Your profile disappears from discovery and matches at once, and you are signed out on every device.',
      },
      {
        heading: 'What is deleted',
        body: 'Your profile, photos, likes, matches and preferences are permanently deleted within [30] days. Messages you sent are removed; the other person sees "Message removed". Backups are overwritten within a further [30] days.',
      },
      {
        heading: 'What is kept, and why',
        body: 'Purchase records, for as long as tax and accounting law requires. Safety records (reports, blocks and bans, linked to a one-way fingerprint of your email rather than the email itself) for [12 months], so banned people cannot simply sign up again. Records needed for a legal claim or a request from the authorities, only as long as needed.',
      },
      {
        heading: 'Instant Meet location',
        body: 'Deleted when each meet ends. The record that a meet happened (who and when, no location) is kept for [90 days] for safety.',
      },
      {
        heading: 'Under-18 entries',
        body: 'A date of birth under 18 is never stored. Only the time of the attempt is kept, for 30 days, to enforce the waiting period.',
      },
      {
        heading: 'Sign-in codes',
        body: 'One-time codes expire after 10 minutes and cannot be used twice.',
      },
    ],
  },
};
