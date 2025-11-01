import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { useAuth } from '../../contexts/AuthContext';
import { notesAPI, bookmarksAPI } from '../../api/api';
import { engineeringCourses } from '../../data/mock';
import { Search, Download, Plus, Trash2, BookOpen, Upload, FileText, Eye, Heart } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import CardSkeleton from '../loading/CardSkeleton';
import PDFPreviewModal from '../modals/PDFPreviewModal';

const normalizeResponse = (res, type = 'notes') => {
  if (!res) return [];
  const d = res.data ?? res;
  if (Array.isArray(d)) return d;
  if (d?.notes) return d.notes;
  if (d?.data && Array.isArray(d.data)) return d.data;
  return [];
};

const Notes = () => {
  const [notes, setNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [bookmarkedNotes, setBookmarkedNotes] = useState(new Set());
  const [previewNote, setPreviewNote] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    branch: '',
    description: '',
    tags: '',
    file: null
  });

  const { currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const branches = engineeringCourses.map(course => course.label);

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedBranch, notes]);

  useEffect(() => {
    if (currentUser && notes.length > 0) {
      checkBookmarks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, notes]);

  const getAuthHeader = () => {
    const token = currentUser?.token || localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const response = await notesAPI.getAll();
      const items = normalizeResponse(response, 'notes');
      setNotes(items);
      setFilteredNotes(items);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
      toast?.({
        title: 'Error',
        description: 'Failed to load notes. Please refresh.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    let filtered = Array.isArray(notes) ? notes : [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(note =>
        (note.title || '').toLowerCase().includes(q) ||
        (note.branch || '').toLowerCase().includes(q) ||
        (note.tags && note.tags.some(tag => (tag || '').toLowerCase().includes(q)))
      );
    }
    if (selectedBranch !== 'all') {
      filtered = filtered.filter(note => note.branch === selectedBranch);
    }
    setFilteredNotes(filtered);
  };

  const handleDownload = async (note) => {
  if (!currentUser) {
    toast({
      title: "Login Required",
      description: "Please login to download notes.",
      variant: "destructive"
    });
    return;
  }
  try {
    const noteId = note.id || note._id;
    // Remove the headers argument to match api.js's download method signature
    await notesAPI.download(noteId);
    toast({ title: "Download Complete", description: `Downloaded: ${note.title}` });
  } catch (error) {
    toast({ title: "Download Failed", description: "Unable to download the note.", variant: "destructive" });
  }
};


  const handleView = (note) => {
    if (!currentUser) {
      toast({
        title: "Login Required",
        description: "Please login to view notes.",
        variant: "destructive"
      });
      return;
    }
    const noteId = note.id || note._id;
    const pdfUrl = process.env.REACT_APP_BACKEND_URL + `/api/notes/${noteId}/view`;
    setPreviewNote({ id: noteId, title: note.title, url: pdfUrl, note });
    setIsPreviewOpen(true);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast({ title: "File Required", description: "Please select a PDF file to upload.", variant: "destructive" });
      return;
    }
    if (!uploadForm.branch) {
      toast({ title: "Branch Required", description: "Please select a branch.", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('branch', uploadForm.branch);
    formData.append('description', uploadForm.description);
    formData.append('tags', uploadForm.tags);
    formData.append('file', uploadForm.file);
    try {
      await notesAPI.create(formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
      toast({ title: "Success", description: "Notes uploaded successfully!" });
      setIsUploadDialogOpen(false);
      setUploadForm({ title: '', branch: '', description: '', tags: '', file: null });
      fetchNotes();
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Upload Failed", description: error?.response?.data?.detail || "Failed to upload notes.", variant: "destructive" });
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete these notes?')) return;
    try {
      await notesAPI.delete(noteId, { headers: getAuthHeader() });
      toast({ title: "Success", description: "Notes deleted successfully!" });
      fetchNotes();
    } catch (error) {
      toast({ title: "Delete Failed", description: "Failed to delete notes. Please try again.", variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedNotes.length === 0) {
      toast({ title: "No Selection", description: "Please select notes to delete.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedNotes.length} note(s)?`)) return;
    try {
      await Promise.all(selectedNotes.map(id => notesAPI.delete(id, { headers: getAuthHeader() })));
      toast({ title: "Success", description: `${selectedNotes.length} note(s) deleted successfully!` });
      setSelectedNotes([]);
      fetchNotes();
    } catch (error) {
      toast({ title: "Delete Failed", description: "Failed to delete some notes. Please try again.", variant: "destructive" });
    }
  };

  const toggleNoteSelection = (noteId) => {
    setSelectedNotes(prev => prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]);
  };

  const checkBookmarks = async () => {
    try {
      if (!Array.isArray(notes) || notes.length === 0) return setBookmarkedNotes(new Set());
      const checks = await Promise.all(notes.map(async (note) => {
        const noteId = note.id || note._id;
        try {
          const resp = await bookmarksAPI.check('note', noteId);
          return { id: noteId, bookmarked: resp?.data?.bookmarked || false };
        } catch (e) {
          return { id: noteId, bookmarked: false };
        }
      }));
      setBookmarkedNotes(new Set(checks.filter(c => c.bookmarked).map(c => c.id)));
    } catch (error) {
      console.error('Error checking bookmarks:', error);
    }
  };

  const handleBookmarkToggle = async (note) => {
    if (!currentUser) {
      toast({ title: "Login Required", description: "Please login to bookmark notes.", variant: "destructive" });
      return;
    }
    const noteId = note.id || note._id;
    const isBookmarked = bookmarkedNotes.has(noteId);
    try {
      if (isBookmarked) {
        await bookmarksAPI.remove('note', noteId, { headers: getAuthHeader() });
        setBookmarkedNotes(prev => { const s = new Set(prev); s.delete(noteId); return s; });
        toast({ title: "Removed", description: "Note removed from bookmarks" });
      } else {
        await bookmarksAPI.create({ resource_type: 'note', resource_id: noteId, category: 'General' }, { headers: getAuthHeader() });
        setBookmarkedNotes(prev => new Set([...prev, noteId]));
        toast({ title: "Bookmarked", description: "Note added to bookmarks" });
      }
    } catch (error) {
      toast({ title: "Error", description: error?.response?.data?.detail || "Failed to update bookmark", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-green-950 dark:via-gray-900 dark:to-blue-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Study Notes</h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">Quality notes shared by engineering students for students</p>
          </div>
          <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            <CardSkeleton count={6} />
          </div>
        </div>
      </div>
    );
  }

  const safeFiltered = Array.isArray(filteredNotes) ? filteredNotes : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-green-950 dark:via-gray-900 dark:to-blue-950">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Study Notes</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">Quality notes shared by engineering students for students</p>
        </div>

        {isAdmin && (
          <div className="mb-6 flex flex-wrap gap-4">
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Notes
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                <DialogHeader>
                  <DialogTitle className="dark:text-white">Upload New Notes</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div>
                    <Label htmlFor="title" className="dark:text-white">Subject Name</Label>
                    <Input id="title" placeholder="Enter subject name" value={uploadForm.title}
                      onChange={(e) => setUploadForm({...uploadForm, title: e.target.value})} required className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <Label htmlFor="branch" className="dark:text-white">Branch</Label>
                    <Select value={uploadForm.branch} onValueChange={(value) => setUploadForm({...uploadForm, branch: value})}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <SelectValue placeholder="Select Branch" />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                        {branches.map(branch => (<SelectItem key={branch} value={branch} className="dark:text-white dark:hover:bg-gray-600">{branch}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="description" className="dark:text-white">Description</Label>
                    <Textarea id="description" placeholder="Enter description (optional)" value={uploadForm.description} onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <Label htmlFor="tags" className="dark:text-white">Tags (comma separated)</Label>
                    <Input id="tags" placeholder="e.g., programming, theory" value={uploadForm.tags} onChange={(e) => setUploadForm({...uploadForm, tags: e.target.value})} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div>
                    <Label htmlFor="file" className="dark:text-white">PDF File</Label>
                    <Input id="file" type="file" accept=".pdf" onChange={(e) => setUploadForm({...uploadForm, file: e.target.files[0]})} required className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1"><Upload className="h-4 w-4 mr-2" /> Upload Notes</Button>
                    <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {selectedNotes.length > 0 && (
              <Button onClick={handleBulkDelete} variant="destructive" className="bg-red-600 hover:bg-red-700">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedNotes.length})
              </Button>
            )}
          </div>
        )}

        <Card className="mb-8 dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Input placeholder="Search notes or subjects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400" />
                </div>
              </div>
              <div>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"><SelectValue placeholder="All Branches" /></SelectTrigger>
                  <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-600">All Branches</SelectItem>
                    {branches.map(branch => (<SelectItem key={branch} value={branch} className="dark:text-white dark:hover:bg-gray-600">{branch}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {safeFiltered.map((note) => {
            const noteId = note.id || note._id;
            return (
              <Card key={noteId} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1 dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {isAdmin && (
                        <Checkbox checked={selectedNotes.includes(noteId)} onCheckedChange={() => toggleNoteSelection(noteId)} className="mb-2" data-testid={`note-checkbox-${noteId}`} />
                      )}
                      <CardTitle className="text-lg leading-tight mb-2 dark:text-white">{note.title}</CardTitle>
                      <Badge variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">{note.branch}</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <Button variant="ghost" size="sm" onClick={() => handleBookmarkToggle(note)} className="p-1 h-auto" data-testid="bookmark-note-btn">
                        <Heart className={`h-5 w-5 ${bookmarkedNotes.has(noteId) ? 'text-red-600 fill-current' : 'text-gray-400 dark:text-gray-500 hover:text-red-600'}`} />
                      </Button>
                      <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <FileText className="h-4 w-4 text-red-500" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {note.description && (<p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{note.description}</p>)}
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {note.tags.slice(0,3).map((tag, idx) => <Badge key={idx} variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">{tag}</Badge>)}
                      {note.tags.length > 3 && (<Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">+{note.tags.length - 3}</Badge>)}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={() => handleView(note)} className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800" size="sm" data-testid="view-note-btn">
                      <Eye className="h-4 w-4 mr-2" /> View
                    </Button>
                    <Button onClick={() => handleDownload(note)} className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800" size="sm" data-testid="download-note-btn">
                      <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                    {isAdmin && (<Button onClick={() => handleDelete(noteId)} variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700" data-testid="delete-note-btn"><Trash2 className="h-4 w-4" /></Button>)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {safeFiltered.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No notes found</h3>
            <p className="text-gray-600 dark:text-gray-400">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>

      <PDFPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} pdfUrl={previewNote?.url} title={previewNote?.title} onDownload={() => previewNote && handleDownload(previewNote.note)} />
    </div>
  );
};

export default Notes;
