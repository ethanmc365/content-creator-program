// Where a creator-kit graphic's card-size copy lives (see uploadKitImage in
// pages/admin/AdminCreatorKit). The original stays at `path` for downloads.
export const kitThumbPath = (path) => `thumbs/${path.replace(/\.[a-z0-9]+$/i, '')}.jpg`
