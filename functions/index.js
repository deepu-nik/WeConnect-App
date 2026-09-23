const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { defineJsonSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;

admin.initializeApp();
const db = admin.firestore();
const cloudinaryConfig = defineJsonSecret('CLOUDINARY_SERVER_CONFIG');

const configureCloudinary = () => {
  const config = cloudinaryConfig.value();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
};

const deleteCloudinaryAsset = async (data) => {
  const publicId = data?.cloudinaryPublicId;
  if (!publicId) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: data.cloudinaryResourceType || 'image',
    type: 'upload',
    invalidate: true,
  });
};

exports.cleanupExpiredStories = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'Asia/Kolkata',
    secrets: [cloudinaryConfig],
    retryCount: 3,
    maxInstances: 1,
  },
  async () => {
    const snapshot = await db.collection('stories')
      .where('expiresAt', '<=', admin.firestore.Timestamp.now())
      .limit(100)
      .get();

    if (snapshot.empty) {
      logger.info('No expired stories found.');
      return;
    }

    const batch = db.batch();
    for (const story of snapshot.docs) {
      try {
        await deleteCloudinaryAsset(story.data());
        batch.delete(story.ref);
      } catch (error) {
        logger.error('Cloudinary cleanup failed; keeping Firestore story for retry.', {
          storyId: story.id,
          error: error.message,
        });
      }
    }

    await batch.commit();
    logger.info('Expired stories cleaned.', { scanned: snapshot.size });
  }
);

exports.deleteStoryMedia = onDocumentDeleted(
  {
    document: 'stories/{storyId}',
    secrets: [cloudinaryConfig],
    retry: true,
    maxInstances: 10,
  },
  async (event) => {
    await deleteCloudinaryAsset(event.data?.data());
    logger.info('Deleted Cloudinary story asset.', { storyId: event.params.storyId });
  }
);


exports.sendMessageNotification = onDocumentCreated(
  'chats/{chatId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message?.senderId) return;

    const chatSnap = await db.doc(`chats/${event.params.chatId}`).get();
    if (!chatSnap.exists) return;
    const chat = chatSnap.data() || {};
    const participants = Array.isArray(chat.participants) ? chat.participants : [];
    const recipientId = participants.find((uid) => uid !== message.senderId);
    if (!recipientId) return;

    const [recipientSnap, senderSnap] = await Promise.all([
      db.doc(`userPrivate/${recipientId}`).get(),
      db.doc(`users/${message.senderId}`).get(),
    ]);

    const expoPushToken = recipientSnap.data()?.expoPushToken;
    if (!expoPushToken) return;

    const senderName = senderSnap.data()?.name || senderSnap.data()?.displayName || 'New message';
    const body = message.text
      || (message.mediaType === 'video' ? 'Sent you a video' : message.mediaType === 'image' ? 'Sent you a photo' : 'Sent you a message');

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: 'default',
        title: senderName,
        body,
        channelId: 'messages',
        data: {
          chatId: event.params.chatId,
          senderId: message.senderId,
          messageId: event.params.messageId,
        },
      }),
    });

    if (!response.ok) {
      logger.error('Expo push request failed.', { status: response.status, recipientId });
      return;
    }

    const result = await response.json();
    logger.info('Message notification sent.', { recipientId, ticket: result?.data });
  }
);
