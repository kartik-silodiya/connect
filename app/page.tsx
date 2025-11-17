'use client';

import { useState, useEffect, ChangeEvent, SetStateAction } from 'react';
import { createClient } from '@/lib/supabase-client';
import { Button } from '@/component/ui/button';
import { Input } from '@/component/ui/input';
import { Textarea } from '@/component/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/component/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/component/ui/avatar';
import { Badge } from '@/component/ui/badge';
import { Separator } from '@/component/ui/separator';
import { toast } from 'sonner';
import { Heart, MessageCircle, UserPlus, LogOut, User as UserIcon, Home, Bell, TrendingUp, Users } from 'lucide-react';

// --- Interfaces for Type Safety ---
interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  bio?: string;
  website?: string;
  location?: string;
  posts_count?: number;
  followers_count?: number;
  following_count?: number;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user?: User;
}

interface Post {
  id: string;
  content: string;
  image_url?: string;
  category: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  author?: User;
}

interface Notification {
  id: string;
  type: 'follow' | 'like' | 'comment';
  is_read: boolean;
  created_at: string;
  actor?: User;
  user_id: string;
}

export default function SocialConnect() {
  const [supabase] = useState(() => createClient());

  const [currentView, setCurrentView] = useState<string>('login');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  
  // Typed Arrays
  const [posts, setPosts] = useState<Post[]>([]);
  const [feed, setFeed] = useState<Post[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [loading, setLoading] = useState(false);

  // Auth state
  const [authData, setAuthData] = useState({
    email: '',
    username: '',
    password: '',
    first_name: '',
    last_name: ''
  });

  // Post state
  const [newPost, setNewPost] = useState({
    content: '',
    image_url: '',
    category: 'general'
  });

  // Load user from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setCurrentView('feed');
      }
    }
  }, []);

  // Fetch data when user changes
  useEffect(() => {
    if (user && token) {
      fetchFeed();
      fetchNotifications();
      subscribeToNotifications();
    }
  }, [user, token]);

  // Subscribe to real-time notifications
  const subscribeToNotifications = async () => {
    if (!user) return;
    const channel = (await supabase)
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          toast.success('New notification!');
          fetchNotifications();
        }
      )
      .subscribe();

    return async () => {
      (await supabase).removeChannel(channel);
    };
  };

  // API helper
  const apiCall = async (endpoint: string, method = 'GET', body: any = null) => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options: RequestInit = {
      method,
      headers
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`/api/${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
  };

  // Auth functions
  const handleRegister = async () => {
    try {
      setLoading(true);
      const data = await apiCall('auth/register', 'POST', authData);
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Registration successful!');
      setCurrentView('feed');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      const data = await apiCall('auth/login', 'POST', {
        email: authData.email,
        username: authData.username,
        password: authData.password
      });
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Login successful!');
      setCurrentView('feed');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentView('login');
    toast.success('Logged out successfully');
  };

  // Post functions
  const fetchPosts = async () => {
    try {
      const data = await apiCall('posts');
      setPosts(data.posts || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const fetchFeed = async () => {
    try {
      const data = await apiCall('posts/feed');
      setFeed(data.posts || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const createPost = async () => {
    if (!newPost.content.trim()) {
      toast.error('Post content is required');
      return;
    }
    try {
      setLoading(true);
      await apiCall('posts', 'POST', newPost);
      setNewPost({ content: '', image_url: '', category: 'general' });
      toast.success('Post created successfully!');
      fetchFeed();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const likePost = async (postId: string) => {
    try {
      await apiCall(`posts/${postId}/like`, 'POST');
      fetchFeed();
      toast.success('Post liked!');
    } catch (error: any) {
      if (error.message.includes('already liked')) {
        // Unlike
        try {
          await apiCall(`posts/${postId}/like`, 'DELETE');
          fetchFeed();
          toast.success('Post unliked!');
        } catch (err: any) {
          toast.error(err.message);
        }
      } else {
        toast.error(error.message);
      }
    }
  };

  const addComment = async (postId: string, content: string) => {
    if (!content.trim()) return;
    try {
      await apiCall(`posts/${postId}/comments`, 'POST', { content });
      toast.success('Comment added!');
      fetchFeed();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // User functions
  const fetchUsers = async () => {
    try {
      const data = await apiCall('users');
      setUsers(data.users || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const followUser = async (userId: string) => {
    try {
      await apiCall(`users/${userId}/follow`, 'POST');
      toast.success('User followed!');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Notifications
  const fetchNotifications = async () => {
    try {
      const data = await apiCall('notifications');
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await apiCall(`notifications/${notificationId}/read`, 'PUT');
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Upload image
  const uploadImage = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'posts');
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data.url;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }
    setLoading(true);
    const url = await uploadImage(file);
    if (url) {
      setNewPost({ ...newPost, image_url: url });
      toast.success('Image uploaded!');
    }
    setLoading(false);
  };

  // Render Login/Register
  if (currentView === 'login' || currentView === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">SocialConnect</CardTitle>
            <CardDescription className="text-center">
              {currentView === 'login' ? 'Welcome back!' : 'Create your account'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentView === 'register' && (
              <>
                <Input
                  placeholder="First Name"
                  value={authData.first_name}
                  onChange={(e: { target: { value: any; }; }) => setAuthData({ ...authData, first_name: e.target.value })}
                />
                <Input
                  placeholder="Last Name"
                  value={authData.last_name}
                  onChange={(e: { target: { value: any; }; }) => setAuthData({ ...authData, last_name: e.target.value })}
                />
                <Input
                  placeholder="Username"
                  value={authData.username}
                  onChange={(e: { target: { value: any; }; }) => setAuthData({ ...authData, username: e.target.value })}
                />
              </>
            )}
            <Input
              type="email"
              placeholder="Email"
              value={authData.email}
              onChange={(e: { target: { value: any; }; }) => setAuthData({ ...authData, email: e.target.value })}
            />
            {currentView === 'login' && (
              <Input
                placeholder="Username (optional)"
                value={authData.username}
                onChange={(e: { target: { value: any; }; }) => setAuthData({ ...authData, username: e.target.value })}
              />
            )}
            <Input
              type="password"
              placeholder="Password"
              value={authData.password}
              onChange={(e: { target: { value: any; }; }) => setAuthData({ ...authData, password: e.target.value })}
            />
            <Button
              className="w-full"
              onClick={currentView === 'login' ? handleLogin : handleRegister}
              disabled={loading}
            >
              {loading ? 'Loading...' : currentView === 'login' ? 'Login' : 'Register'}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setCurrentView(currentView === 'login' ? 'register' : 'login')}
            >
              {currentView === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main App
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-600">SocialConnect</h1>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setCurrentView('feed')}>
              <Home className="w-4 h-4 mr-2" />
              Feed
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCurrentView('explore'); fetchPosts(); }}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Explore
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCurrentView('users'); fetchUsers(); }}>
              <Users className="w-4 h-4 mr-2" />
              Users
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCurrentView('notifications'); fetchNotifications(); }}>
              <Bell className="w-4 h-4 mr-2" />
              {notifications.filter(n => !n.is_read).length > 0 && (
                <Badge className="ml-1" variant="destructive">
                  {notifications.filter(n => !n.is_read).length}
                </Badge>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentView('profile')}>
              <UserIcon className="w-4 h-4 mr-2" />
              Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Feed View */}
        {currentView === 'feed' && (
          <div className="space-y-6">
            {/* Create Post */}
            <Card>
              <CardHeader>
                <CardTitle>Create Post</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="What's on your mind?"
                  value={newPost.content}
                  onChange={(e: { target: { value: any; }; }) => setNewPost({ ...newPost, content: e.target.value })}
                  maxLength={280}
                  rows={3}
                />
                <div className="text-sm text-gray-500 text-right">
                  {newPost.content.length}/280
                </div>
                <div className="flex gap-2">
                  <select
                    className="border rounded px-3 py-2"
                    value={newPost.category}
                    onChange={(e) => setNewPost({ ...newPost, category: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="announcement">Announcement</option>
                    <option value="question">Question</option>
                  </select>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="flex-1"
                  />
                </div>
                {newPost.image_url && (
                  <img src={newPost.image_url} alt="Preview" className="max-h-40 rounded" />
                )}
                <Button onClick={createPost} disabled={loading} className="w-full">
                  Post
                </Button>
              </CardContent>
            </Card>
            {/* Feed Posts */}
            <div className="space-y-4">
              {feed.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-gray-500">
                    No posts in your feed. Follow some users to see their posts!
                  </CardContent>
                </Card>
              ) : (
                feed.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={() => likePost(post.id)}
                    onComment={(content) => addComment(post.id, content)}
                  />
                ))
              )}
            </div>
          </div>
        )}
        {/* Explore View */}
        {currentView === 'explore' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Explore Posts</h2>
            {posts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No posts available
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={() => likePost(post.id)}
                  onComment={(content) => addComment(post.id, content)}
                />
              ))
            )}
          </div>
        )}
        {/* Users View */}
        {currentView === 'users' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Discover Users</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {users.map((u) => (
                <Card key={u.id}>
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={u.avatar_url} />
                        <AvatarFallback>{u.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{u.username}</CardTitle>
                        <CardDescription>
                          {u.first_name} {u.last_name}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-4">{u.bio || 'No bio yet'}</p>
                    <div className="flex gap-4 text-sm text-gray-500">
                      <span>{u.posts_count} posts</span>
                      <span>{u.followers_count} followers</span>
                      <span>{u.following_count} following</span>
                    </div>
                  </CardContent>
                  <CardFooter>
                    {u.id !== user?.id && (
                      <Button
                        size="sm"
                        onClick={() => followUser(u.id)}
                        className="w-full"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Follow
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
        {/* Notifications View */}
        {currentView === 'notifications' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Notifications</h2>
            {notifications.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No notifications yet
                </CardContent>
              </Card>
            ) : (
              notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={notification.is_read ? 'bg-white' : 'bg-blue-50'}
                  onClick={() => !notification.is_read && markNotificationRead(notification.id)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={notification.actor?.avatar_url} />
                        <AvatarFallback>
                          {notification.actor?.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-semibold">{notification.actor?.username}</span>
                          {notification.type === 'follow' && ' started following you'}
                          {notification.type === 'like' && ' liked your post'}
                          {notification.type === 'comment' && ' commented on your post'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
        {/* Profile View */}
        {currentView === 'profile' && user && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>My Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={user.avatar_url} />
                    <AvatarFallback className="text-2xl">
                      {user.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-2xl font-bold">{user.username}</h3>
                    <p className="text-gray-500">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-sm text-gray-400">{user.email}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{user.posts_count}</div>
                    <div className="text-sm text-gray-500">Posts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{user.followers_count}</div>
                    <div className="text-sm text-gray-500">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{user.following_count}</div>
                    <div className="text-sm text-gray-500">Following</div>
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-2">Bio</h4>
                  <p className="text-gray-600">{user.bio || 'No bio yet'}</p>
                </div>
                {user.website && (
                  <div>
                    <h4 className="font-semibold mb-2">Website</h4>
                    <a href={user.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {user.website}
                    </a>
                  </div>
                )}
                {user.location && (
                  <div>
                    <h4 className="font-semibold mb-2">Location</h4>
                    <p className="text-gray-600">{user.location}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// Post Card Component Interface
interface PostCardProps {
  post: Post;
  onLike: () => void;
  onComment: (content: string) => void;
}

function PostCard({ post, onLike, onComment }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);

  const loadComments = async () => {
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`);
      const data = await response.json();
      setComments(data.comments || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  useEffect(() => {
    if (showComments) {
      loadComments();
    }
  }, [showComments]);

  const handleAddComment = () => {
    if (commentText.trim()) {
      onComment(commentText);
      setCommentText('');
      loadComments();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={post.author?.avatar_url} />
            <AvatarFallback>{post.author?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-semibold">{post.author?.username}</p>
            <p className="text-xs text-gray-500">
              {new Date(post.created_at).toLocaleString()}
            </p>
          </div>
          <Badge variant="secondary">{post.category}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-gray-800">{post.content}</p>
        {post.image_url && (
          <img
            src={post.image_url}
            alt="Post"
            className="w-full max-h-96 object-cover rounded-lg"
          />
        )}
      </CardContent>
      <CardFooter className="flex-col space-y-3">
        <div className="flex gap-4 w-full">
          <Button variant="ghost" size="sm" onClick={onLike}>
            <Heart className="w-4 h-4 mr-2" />
            {post.like_count}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            {post.comment_count}
          </Button>
        </div>
        {showComments && (
          <div className="w-full space-y-3">
            <Separator />
            <div className="space-y-2">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={comment.user?.avatar_url} />
                    <AvatarFallback>
                      {comment.user?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 bg-gray-100 rounded-lg p-2">
                    <p className="font-semibold text-sm">{comment.user?.username}</p>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e: { target: { value: SetStateAction<string>; }; }) => setCommentText(e.target.value)}
                onKeyPress={(e: { key: string; }) => e.key === 'Enter' && handleAddComment()}
              />
              <Button size="sm" onClick={handleAddComment}>
                Post
              </Button>
            </div>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}