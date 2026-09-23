import * as FileSystem from 'expo-file-system/legacy';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const getExtension = (uri) => {
  const clean = String(uri || '').split('?')[0];
  const match = clean.match(/\\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || null;
};

const getMimeType = (extension, type) => {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', heic: 'image/heic',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
    mp4: 'video/mp4', mov: 'video/quicktime',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip',
  };
  return map[extension] || (type === 'audio' ? 'audio/mp4' : 'application/octet-stream');
};

const makeCacheUri = (extension) =>
  `${FileSystem.cacheDirectory}weconnect_upload_${Date.now()}_${Math.random().toString(36).slice(2)}${extension ? `.${extension}` : ''}`;

const ensureLocalReadableUri = async (uri, extension) => {
  // Android document pickers can return SAF content:// URIs. Copy them into
  // the app cache first so the native multipart uploader has a normal file URI.
  const targetUri = makeCacheUri(extension);
  await FileSystem.copyAsync({ from: uri, to: targetUri });

  const info = await FileSystem.getInfoAsync(targetUri);
  if (!info.exists) {
    throw new Error('The selected file could not be copied into app storage.');
  }
  return targetUri;
};

export const uploadToCloudinary = async (fileUri, type = 'auto', options = {}) => {
  if (!fileUri || !CLOUD_NAME || !UPLOAD_PRESET) {
    console.error('Cloudinary configuration is missing.');
    return null;
  }

  let localUri = fileUri;

  try {
    const extension = getExtension(fileUri);
    const resourceType = type === 'image' ? 'image' : type === 'audio' ? 'video' : type === 'video' ? 'video' : 'auto';
    const filename = 'upload_' + Date.now() + (extension ? '.' + extension : '');
    const mimeType = getMimeType(extension, type);

    localUri = await ensureLocalReadableUri(fileUri, extension);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    const parameters = {
      upload_preset: UPLOAD_PRESET,
      folder: options.folder || (type === 'video'
        ? 'weconnect/stories/video'
        : type === 'image'
          ? 'weconnect/stories/image'
          : 'weconnect/uploads'),
      tags: options.tags || (type === 'video' || type === 'image' ? 'weconnect_story' : 'weconnect_media'),
    };

    // Use Expo's legacy native multipart uploader here instead of
    // new File().bytes(). FormData serialization can trigger Android SAF
    // READ-permission failures for picker URIs.
    const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      parameters,
      headers: {
        'X-File-Name': filename,
        'X-File-Type': mimeType,
      },
    });

    let data = {};
    try {
      data = result.body ? JSON.parse(result.body) : {};
    } catch {
      console.error('Cloudinary returned a non-JSON response:', result.body);
    }

    if (result.status < 200 || result.status >= 300 || !data.secure_url) {
      console.error('Cloudinary upload failed:', data || result.body);
      return null;
    }

    if (options.returnMetadata) {
      return {
        secureUrl: data.secure_url,
        publicId: data.public_id || null,
        resourceType: data.resource_type || resourceType,
        format: data.format || null,
        bytes: Number(data.bytes || 0),
        duration: data.duration ? Number(data.duration) : null,
        width: data.width ? Number(data.width) : null,
        height: data.height ? Number(data.height) : null,
      };
    }

    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  } finally {
    if (localUri && localUri !== fileUri && localUri.startsWith(FileSystem.cacheDirectory || '__never__')) {
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {}
    }
  }
};
