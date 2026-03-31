/**
 * Cloudinary unsigned upload adapter.
 * Uses the Cloudinary Upload API (REST) with an unsigned preset.
 * No SDK — plain XHR for progress tracking.
 *
 * Free tier: 25 GB storage, 25 GB bandwidth/month.
 *
 * Setup:
 *   1. Create a free Cloudinary account (cloudinary.com)
 *   2. Go to Settings → Upload → Add upload preset
 *   3. Set signing mode to "Unsigned"
 *   4. Note your cloud name (Dashboard top-left) and preset name
 *   5. Enter both in the app's Settings tab
 */

/**
 * Upload a file to Cloudinary via unsigned upload REST API.
 * @param {Object} opts
 * @param {string} opts.cloudName  - Cloudinary cloud name
 * @param {string} opts.preset     - Unsigned upload preset name
 * @param {File}   opts.file       - File to upload
 * @param {string} [opts.folder]   - Optional folder path (e.g. "jdr/rooms/abc/audio")
 * @param {string} [opts.resourceType] - "auto" | "image" | "video" | "raw" (default: "auto")
 * @param {(progress: number) => void} [opts.onProgress] - 0..1 progress callback
 * @returns {Promise<{ url: string, name: string, publicId: string, bytes: number, format: string }>}
 */
export function uploadToCloudinary({ cloudName, preset, file, folder, resourceType = "auto", onProgress }) {
  return new Promise((resolve, reject) => {
    if (!cloudName || !preset) {
      reject(new Error("Cloudinary cloudName and upload preset are required"));
      return;
    }

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", preset);
    if (folder) formData.append("folder", folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve({
            url: res.secure_url,
            name: res.original_filename || file.name,
            publicId: res.public_id,
            bytes: res.bytes,
            format: res.format,
          });
        } catch {
          reject(new Error("Failed to parse Cloudinary response"));
        }
      } else {
        let msg = `Cloudinary upload failed: ${xhr.status}`;
        try {
          const err = JSON.parse(xhr.responseText);
          if (err.error?.message) msg = err.error.message;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Cloudinary upload network error"));
    xhr.send(formData);
  });
}
