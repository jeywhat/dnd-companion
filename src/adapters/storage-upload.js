/**
 * Firebase Storage REST upload adapter.
 * No Firebase SDK — uses the Storage REST API directly.
 *
 * Requires Firebase Storage rules to allow unauthenticated uploads
 * (similar to RTDB test mode).
 *
 * Security rules example:
 *   rules_version = '2';
 *   service firebase.storage {
 *     match /b/{bucket}/o {
 *       match /rooms/{roomId}/audio/{file} {
 *         allow read: if true;
 *         allow write: if request.resource.size < 50 * 1024 * 1024; // 50MB max
 *       }
 *     }
 *   }
 */

/**
 * Extract Firebase project ID from the RTDB URL.
 * e.g. "https://my-project-default-rtdb.firebaseio.com" → "my-project"
 */
export function extractProjectId(firebaseUrl) {
  if (!firebaseUrl) return null;
  try {
    const hostname = new URL(firebaseUrl).hostname;
    // Format: {project-id}-default-rtdb.firebaseio.com
    // or:     {project-id}-default-rtdb.{region}.firebasedatabase.app
    const match = hostname.match(/^(.+?)-default-rtdb\./);
    if (match) return match[1];
    // Fallback: {project-id}.firebaseio.com
    const match2 = hostname.match(/^(.+?)\.firebaseio\.com$/);
    if (match2) return match2[1];
  } catch { /* invalid URL */ }
  return null;
}

/**
 * Derive the default Storage bucket from the RTDB URL.
 */
export function deriveStorageBucket(firebaseUrl, storageBucket) {
  if (storageBucket?.trim()) return storageBucket.trim();
  const projectId = extractProjectId(firebaseUrl);
  if (projectId) return `${projectId}.firebasestorage.app`;
  return null;
}

/**
 * Upload a file to Firebase Storage via REST API.
 * @param {Object} opts
 * @param {string} opts.bucket - Storage bucket name (e.g. "my-project.appspot.com")
 * @param {string} opts.path - Storage path (e.g. "rooms/abc/audio/file.mp3")
 * @param {File} opts.file - File to upload
 * @param {(progress: number) => void} [opts.onProgress] - 0..1 progress callback
 * @returns {Promise<string>} Download URL
 */
export function uploadToStorage({ bucket, path, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const encodedPath = encodeURIComponent(path);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${path}`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
        resolve(downloadUrl);
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });
}
