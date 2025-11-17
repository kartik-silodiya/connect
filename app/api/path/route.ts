import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client'; // Ensure this path points to your admin client
import jwt, { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'socialconnect-super-secret-jwt-key-2025';

// Interface for your specific JWT structure
interface DecodedToken extends JwtPayload {
  userId: string;
  email: string;
}

// Interface for Route Parameters
interface RouteParams {
  params: {
    path: string[];
  };
}

// Helper function to verify JWT token
const verifyToken = (token: string): DecodedToken | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return decoded as DecodedToken;
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Helper function to get user from request
const getUserFromRequest = (request: NextRequest): DecodedToken | null => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return verifyToken(token);
};

// Helper function to check if user is admin
const isAdmin = async (userId: string): Promise<boolean> => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return user?.role === 'admin';
};

// Helper function to upload image to Supabase Storage
const uploadImage = async (file: File, bucket: string, userId: string) => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .upload(fileName, file);

    if (error) throw error;

    const { data: urlData } = supabaseAdmin
      .storage
      .from(bucket)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    return null;
  }
};

// ============= AUTH ENDPOINTS =============

// POST /api/auth/register - Register new user
const handleRegister = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { email, username, password, first_name, last_name } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, first_name, last_name }
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Registration failed' }, { status: 400 });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: authData.user.id, email }, JWT_SECRET, { expiresIn: '7d' });

    return NextResponse.json({
      message: 'User registered successfully',
      access_token: token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        username
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/auth/login - User login
const handleLogin = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { email, username, password } = body;

    if ((!email && !username) || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    let loginEmail = email;
    if (!loginEmail && username) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('username', username)
        .single();
      loginEmail = userData?.email;
    }

    if (!loginEmail) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: loginEmail,
      password
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', authData.user.id);

    // Get user profile
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    // Generate JWT token
    const token = jwt.sign({ userId: authData.user.id, email: loginEmail }, JWT_SECRET, { expiresIn: '7d' });

    return NextResponse.json({
      access_token: token,
      refresh_token: authData.session?.refresh_token,
      user: userProfile
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/auth/logout - User logout
const handleLogout = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/auth/password-reset - Request password reset
const handlePasswordReset = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Password reset email sent' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/auth/change-password - Change password
const handleChangePassword = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { old_password, new_password } = body;

    if (!old_password || !new_password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.userId, {
      password: new_password
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// ============= USER ENDPOINTS =============

// GET /api/users - List all users (with pagination)
const handleGetUsers = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const { data: users, error, count } = await supabaseAdmin
      .from('users')
      .select('id, username, email, first_name, last_name, avatar_url, bio, followers_count, following_count, posts_count, created_at', { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/users/{userId} - Get user profile
const handleGetUser = async (request: NextRequest, userId: string) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/users/me - Get current user profile
const handleGetCurrentUser = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userProfile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ user: userProfile });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// PUT/PATCH /api/users/me - Update current user profile
const handleUpdateCurrentUser = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { bio, website, location, profile_visibility, first_name, last_name } = body;

    const updates: any = {};
    if (bio !== undefined) updates.bio = bio?.substring(0, 160);
    if (website !== undefined) updates.website = website;
    if (location !== undefined) updates.location = location;
    if (profile_visibility !== undefined) updates.profile_visibility = profile_visibility;
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;

    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', user.userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/users/{userId}/follow - Follow a user
const handleFollowUser = async (request: NextRequest, userId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.userId === userId) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('follows')
      .insert({ follower_id: user.userId, following_id: userId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already following this user' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Create notification
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: user.userId,
        type: 'follow'
      });

    return NextResponse.json({ message: 'User followed successfully', follow: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// DELETE /api/users/{userId}/follow - Unfollow a user
const handleUnfollowUser = async (request: NextRequest, userId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('follows')
      .delete()
      .eq('follower_id', user.userId)
      .eq('following_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'User unfollowed successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/users/{userId}/followers - Get user followers
const handleGetFollowers = async (request: NextRequest, userId: string) => {
  try {
    const { data: followers, error } = await supabaseAdmin
      .from('follows')
      .select('follower_id, users!follows_follower_id_fkey(id, username, email, first_name, last_name, avatar_url, bio)')
      .eq('following_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const followersList = followers.map((f: { users: any; }) => f.users);
    return NextResponse.json({ followers: followersList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/users/{userId}/following - Get users that user is following
const handleGetFollowing = async (request: NextRequest, userId: string) => {
  try {
    const { data: following, error } = await supabaseAdmin
      .from('follows')
      .select('following_id, users!follows_following_id_fkey(id, username, email, first_name, last_name, avatar_url, bio)')
      .eq('follower_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const followingList = following.map((f: { users: any; }) => f.users);
    return NextResponse.json({ following: followingList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// ============= POST ENDPOINTS =============

// GET /api/posts - List all posts (with pagination)
const handleGetPosts = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const { data: posts, error, count } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:users!posts_author_id_fkey(id, username, first_name, last_name, avatar_url)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/posts/feed - Get personalized feed (posts from followed users)
const handleGetFeed = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Get list of users the current user is following
    const { data: following } = await supabaseAdmin
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.userId);

    const followingIds = following?.map((f: { following_id: any; }) => f.following_id) || [];
    followingIds.push(user.userId); // Include own posts

    const { data: posts, error, count } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:users!posts_author_id_fkey(id, username, first_name, last_name, avatar_url)
      `, { count: 'exact' })
      .in('author_id', followingIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/posts - Create a new post
const handleCreatePost = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, image_url, category } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (content.length > 280) {
      return NextResponse.json({ error: 'Content must be 280 characters or less' }, { status: 400 });
    }

    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert({
        content,
        author_id: user.userId,
        image_url: image_url || null,
        category: category || 'general'
      })
      .select(`
        *,
        author:users!posts_author_id_fkey(id, username, first_name, last_name, avatar_url)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ post }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/posts/{postId} - Get a single post
const handleGetPost = async (request: NextRequest, postId: string) => {
  try {
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:users!posts_author_id_fkey(id, username, first_name, last_name, avatar_url)
      `)
      .eq('id', postId)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// PUT/PATCH /api/posts/{postId} - Update a post
const handleUpdatePost = async (request: NextRequest, postId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user owns the post
    const { data: existingPost } = await supabaseAdmin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single();

    if (!existingPost || existingPost.author_id !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { content, image_url, category } = body;

    const updates: any = {};
    if (content !== undefined) {
      if (content.length > 280) {
        return NextResponse.json({ error: 'Content must be 280 characters or less' }, { status: 400 });
      }
      updates.content = content;
    }
    if (image_url !== undefined) updates.image_url = image_url;
    if (category !== undefined) updates.category = category;

    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .update(updates)
      .eq('id', postId)
      .select(`
        *,
        author:users!posts_author_id_fkey(id, username, first_name, last_name, avatar_url)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ post });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// DELETE /api/posts/{postId} - Delete a post
const handleDeletePost = async (request: NextRequest, postId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user owns the post or is admin
    const { data: existingPost } = await supabaseAdmin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single();

    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const userIsAdmin = await isAdmin(user.userId);
    if (existingPost.author_id !== user.userId && !userIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Post deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/posts/{postId}/like - Like a post
const handleLikePost = async (request: NextRequest, postId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('likes')
      .insert({ user_id: user.userId, post_id: postId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Post already liked' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Get post author for notification
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single();

    // Create notification
    if (post && post.author_id !== user.userId) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: post.author_id,
          actor_id: user.userId,
          type: 'like',
          post_id: postId
        });
    }

    return NextResponse.json({ message: 'Post liked successfully', like: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// DELETE /api/posts/{postId}/like - Unlike a post
const handleUnlikePost = async (request: NextRequest, postId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('likes')
      .delete()
      .eq('user_id', user.userId)
      .eq('post_id', postId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Post unliked successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/posts/{postId}/comments - Get comments for a post
const handleGetComments = async (request: NextRequest, postId: string) => {
  try {
    const { data: comments, error } = await supabaseAdmin
      .from('comments')
      .select(`
        *,
        user:users!comments_user_id_fkey(id, username, first_name, last_name, avatar_url)
      `)
      .eq('post_id', postId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ comments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/posts/{postId}/comments - Add a comment to a post
const handleCreateComment = async (request: NextRequest, postId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json({ error: 'Content must be 500 characters or less' }, { status: 400 });
    }

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        content,
        user_id: user.userId,
        post_id: postId
      })
      .select(`
        *,
        user:users!comments_user_id_fkey(id, username, first_name, last_name, avatar_url)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Get post author for notification
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single();

    // Create notification
    if (post && post.author_id !== user.userId) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: post.author_id,
          actor_id: user.userId,
          type: 'comment',
          post_id: postId,
          comment_id: comment.id
        });
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// ============= ADMIN ENDPOINTS =============

// GET /api/admin/users - List all users (Admin only)
const handleAdminGetUsers = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIsAdmin = await isAdmin(user.userId);
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const { data: users, error, count } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/admin/users/{userId}/deactivate - Deactivate a user (Admin only)
const handleAdminDeactivateUser = async (request: NextRequest, userId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIsAdmin = await isAdmin(user.userId);
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'User deactivated successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/admin/posts - List all posts (Admin only)
const handleAdminGetPosts = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIsAdmin = await isAdmin(user.userId);
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const { data: posts, error, count } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:users!posts_author_id_fkey(id, username, first_name, last_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/admin/stats - Get basic statistics (Admin only)
const handleAdminGetStats = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIsAdmin = await isAdmin(user.userId);
    if (!userIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: totalUsers } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: totalPosts } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true });

    const { count: activeToday } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_login', today.toISOString());

    return NextResponse.json({
      stats: {
        total_users: totalUsers,
        total_posts: totalPosts,
        active_today: activeToday
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// GET /api/notifications - Get user notifications
const handleGetNotifications = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select(`
        *,
        actor:users!notifications_actor_id_fkey(id, username, first_name, last_name, avatar_url),
        post:posts(id, content)
      `)
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ notifications });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// PUT /api/notifications/{notificationId}/read - Mark notification as read
const handleMarkNotificationRead = async (request: NextRequest, notificationId: string) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Notification marked as read' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// POST /api/upload - Upload image
const handleUpload = async (request: NextRequest) => {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bucket = (formData.get('bucket') as string) || 'posts';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 2MB' }, { status: 400 });
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.userId}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: urlData } = supabaseAdmin
      .storage
      .from(bucket)
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

// ============= MAIN ROUTER =============

export async function GET(request: NextRequest, { params }: RouteParams) {
  const path = params?.path?.join('/') || '';

  // Auth routes
  if (path === 'auth/logout') return handleLogout(request);

  // User routes
  if (path === 'users') return handleGetUsers(request);
  if (path === 'users/me') return handleGetCurrentUser(request);
  if (path.match(/^users\/[a-f0-9-]+$/)) {
    const userId = path.split('/')[1];
    return handleGetUser(request, userId);
  }
  if (path.match(/^users\/[a-f0-9-]+\/followers$/)) {
    const userId = path.split('/')[1];
    return handleGetFollowers(request, userId);
  }
  if (path.match(/^users\/[a-f0-9-]+\/following$/)) {
    const userId = path.split('/')[1];
    return handleGetFollowing(request, userId);
  }

  // Post routes
  if (path === 'posts') return handleGetPosts(request);
  if (path === 'posts/feed') return handleGetFeed(request);
  if (path.match(/^posts\/[a-f0-9-]+$/)) {
    const postId = path.split('/')[1];
    return handleGetPost(request, postId);
  }
  if (path.match(/^posts\/[a-f0-9-]+\/comments$/)) {
    const postId = path.split('/')[1];
    return handleGetComments(request, postId);
  }

  // Admin routes
  if (path === 'admin/users') return handleAdminGetUsers(request);
  if (path === 'admin/posts') return handleAdminGetPosts(request);
  if (path === 'admin/stats') return handleAdminGetStats(request);

  // Notifications
  if (path === 'notifications') return handleGetNotifications(request);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const path = params?.path?.join('/') || '';

  // Auth routes
  if (path === 'auth/register') return handleRegister(request);
  if (path === 'auth/login') return handleLogin(request);
  if (path === 'auth/password-reset') return handlePasswordReset(request);
  if (path === 'auth/change-password') return handleChangePassword(request);

  // User routes
  if (path.match(/^users\/[a-f0-9-]+\/follow$/)) {
    const userId = path.split('/')[1];
    return handleFollowUser(request, userId);
  }

  // Post routes
  if (path === 'posts') return handleCreatePost(request);
  if (path.match(/^posts\/[a-f0-9-]+\/like$/)) {
    const postId = path.split('/')[1];
    return handleLikePost(request, postId);
  }
  if (path.match(/^posts\/[a-f0-9-]+\/comments$/)) {
    const postId = path.split('/')[1];
    return handleCreateComment(request, postId);
  }

  // Admin routes
  if (path.match(/^admin\/users\/[a-f0-9-]+\/deactivate$/)) {
    const userId = path.split('/')[2];
    return handleAdminDeactivateUser(request, userId);
  }

  // Upload
  if (path === 'upload') return handleUpload(request);

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const path = params?.path?.join('/') || '';

  // User routes
  if (path === 'users/me') return handleUpdateCurrentUser(request);

  // Post routes
  if (path.match(/^posts\/[a-f0-9-]+$/)) {
    const postId = path.split('/')[1];
    return handleUpdatePost(request, postId);
  }

  // Notifications
  if (path.match(/^notifications\/[a-f0-9-]+\/read$/)) {
    const notificationId = path.split('/')[1];
    return handleMarkNotificationRead(request, notificationId);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return PUT(request, { params });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const path = params?.path?.join('/') || '';

  // User routes
  if (path.match(/^users\/[a-f0-9-]+\/follow$/)) {
    const userId = path.split('/')[1];
    return handleUnfollowUser(request, userId);
  }

  // Post routes
  if (path.match(/^posts\/[a-f0-9-]+$/)) {
    const postId = path.split('/')[1];
    return handleDeletePost(request, postId);
  }
  if (path.match(/^posts\/[a-f0-9-]+\/like$/)) {
    const postId = path.split('/')[1];
    return handleUnlikePost(request, postId);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}