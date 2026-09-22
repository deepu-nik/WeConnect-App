const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentDeleted } = require('firebase-functions/v2/firestore');
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
