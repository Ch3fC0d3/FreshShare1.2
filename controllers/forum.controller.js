const jwt = require('jsonwebtoken');
const ForumPost = require('../models/forum-post.model');
const ForumComment = require('../models/forum-comment.model');
const ForumLike = require('../models/forum-like.model');

function getUserFromReq(req){
  try {
    if (req.user) return req.user;
    const tokenFromCookie = req.cookies && req.cookies.token;
    const authHeader = req.headers && req.headers.authorization;
    const rawToken = tokenFromCookie || (authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) : null);
    if (rawToken) {
      const authConfig = require('../config/auth.config');
      const decoded = jwt.verify(rawToken, authConfig.secret);
      if (decoded && decoded.id) return { id: decoded.id };
    }
  } catch(_) {}
  return null;
}

function cleanStr(v, max){
  try {
    const s = String(v || '').trim();
    return (typeof max === 'number') ? s.slice(0, max) : s;
  } catch(_) { return ''; }
}

exports.listPosts = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      ForumPost.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('createdBy', 'username profileImage')
        .lean(),
      ForumPost.countDocuments({})
    ]);
    
    // Fallback: For posts without createdBy, try to look up user by authorName
    const User = require('../models/user.model');
    for (const item of items) {
      if (!item.createdBy && item.authorName) {
        try {
          console.log('[forum.controller] Looking up user by authorName:', item.authorName);
          const foundUser = await User.findOne({ username: item.authorName })
            .select('username profileImage')
            .lean();
          if (foundUser) {
            console.log('[forum.controller] Found user:', foundUser.username, 'with image:', foundUser.profileImage);
            item.createdBy = foundUser;
          } else {
            console.log('[forum.controller] User not found for authorName:', item.authorName);
          }
        } catch(err) {
          console.error('[forum.controller] Error looking up user:', err);
        }
      } else {
        console.log('[forum.controller] Post already has createdBy or no authorName:', {
          hasCreatedBy: !!item.createdBy,
          authorName: item.authorName
        });
      }
    }
    
    // attach liked state for current user
    if (user && user.id && items.length){
      const ids = items.map(it => it._id);
      try {
        const likes = await ForumLike.find({ userId: user.id, postId: { $in: ids } }).select('postId').lean();
        const likedSet = new Set(likes.map(l => String(l.postId)));
        items.forEach(it => { if (likedSet.has(String(it._id))) it.liked = true; });
      } catch(_) {}
    }
    
    return res.status(200).json({ success: true, data: items, page, limit, total });
  } catch (e) {
    return res.status(500).json({ success: false, message: e && e.message ? e.message : 'Failed to load posts' });
  }
};

exports.createPost = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const title = cleanStr(req.body && req.body.title, 200);
    const content = cleanStr(req.body && req.body.content, 10000);
    const category = cleanStr(req.body && req.body.category, 64);

    if (!title || !content){
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const allowedCategories = ['Questions','Discussion','Tips & Tricks','Recipes','Success Stories'];
    const cat = allowedCategories.includes(category) ? category : 'Discussion';

    const doc = await ForumPost.create({
      title,
      content,
      category: cat,
      images: Array.isArray(req.body && req.body.images) ? req.body.images.slice(0, 6) : [],
      createdBy: user && user.id ? user.id : null,
      authorName: (req.body && cleanStr(req.body.authorName, 80)) || (res.locals && res.locals.user && res.locals.user.username) || ''
    });

    // Populate user data for response
    const populated = await ForumPost.findById(doc._id).populate('createdBy', 'username profileImage').lean();
    
    return res.status(201).json({ 
      success: true, 
      data: { 
        id: String(doc._id), 
        title: doc.title, 
        content: doc.content, 
        category: doc.category, 
        createdAt: doc.createdAt, 
        authorName: doc.authorName || (populated && populated.createdBy && populated.createdBy.username) || '',
        createdBy: populated && populated.createdBy ? populated.createdBy : null
      } 
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e && e.message ? e.message : 'Failed to create post' });
  }
};

exports.listComments = async (req, res) => {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, message: 'Post ID required' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      ForumComment.find({ postId }).sort({ createdAt: 1 }).skip(skip).limit(limit)
        .populate('createdBy', 'username profileImage')
        .lean(),
      ForumComment.countDocuments({ postId })
    ]);
    
    // Fallback: For comments without createdBy, try to look up user by authorName
    const User = require('../models/user.model');
    for (const item of items) {
      if (!item.createdBy && item.authorName) {
        try {
          const foundUser = await User.findOne({ username: item.authorName })
            .select('username profileImage')
            .lean();
          if (foundUser) {
            item.createdBy = foundUser;
          }
        } catch(_) {}
      }
    }
    
    return res.status(200).json({ success: true, data: items, page, limit, total });
  } catch (e) {
    return res.status(500).json({ success: false, message: e && e.message ? e.message : 'Failed to load comments' });
  }
};

exports.addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, message: 'Post ID required' });
    const user = getUserFromReq(req);
    const content = cleanStr(req.body && req.body.content, 2000);
    const authorName = (req.body && cleanStr(req.body.authorName, 80)) || (res.locals && res.locals.user && res.locals.user.username) || '';
    if (!content) return res.status(400).json({ success: false, message: 'Content is required' });
    // Ensure post exists
    const post = await ForumPost.findById(postId).select('_id');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    const doc = await ForumComment.create({ postId, content, createdBy: user && user.id ? user.id : null, authorName });
    try { await ForumPost.updateOne({ _id: postId }, { $inc: { commentsCount: 1 } }); } catch(_) {}
    
    // Populate user data for response
    const populated = await ForumComment.findById(doc._id).populate('createdBy', 'username profileImage').lean();
    const responseData = {
      id: String(doc._id),
      postId: String(doc.postId),
      content: doc.content,
      createdAt: doc.createdAt,
      authorName: doc.authorName || (populated && populated.createdBy && populated.createdBy.username) || '',
      createdBy: populated && populated.createdBy ? populated.createdBy : null
    };
    
    return res.status(201).json({ success: true, data: responseData });
  } catch (e) {
    return res.status(500).json({ success: false, message: e && e.message ? e.message : 'Failed to add comment' });
  }
};

// Persistent like toggle (requires auth)
exports.toggleLike = async (req, res) => {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, message: 'Post ID required' });
    const user = getUserFromReq(req);
    if (!user || !user.id) return res.status(401).json({ success: false, message: 'Login required to like posts' });
    // Ensure post exists
    const post = await ForumPost.findById(postId).select('_id likesCount');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const existing = await ForumLike.findOne({ postId, userId: user.id });
    if (existing){
      await ForumLike.deleteOne({ _id: existing._id });
      await ForumPost.updateOne({ _id: postId }, { $inc: { likesCount: -1 } });
      const updated = await ForumPost.findById(postId).select('likesCount');
      return res.status(200).json({ success: true, data: { liked: false, likesCount: updated ? Number(updated.likesCount||0) : Math.max(0, Number(post.likesCount||0)-1) } });
    } else {
      await ForumLike.create({ postId, userId: user.id });
      await ForumPost.updateOne({ _id: postId }, { $inc: { likesCount: 1 } });
      const updated = await ForumPost.findById(postId).select('likesCount');
      return res.status(200).json({ success: true, data: { liked: true, likesCount: updated ? Number(updated.likesCount||0) : Number(post.likesCount||0)+1 } });
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: e && e.message ? e.message : 'Failed to toggle like' });
  }
};
