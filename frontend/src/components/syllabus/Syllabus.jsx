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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useAuth } from '../../contexts/AuthContext';
import { syllabusAPI, bookmarksAPI } from '../../api/api';
import { engineeringCourses } from '../../data/mock';
import { Search, Download, Plus, Trash2, GraduationCap, Upload, FileText, Eye, Heart } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import CardSkeleton from '../loading/CardSkeleton';
import PDFPreviewModal from '../modals/PDFPreviewModal';

const normalizeResponse = (res, type = 'syllabus') => {
  if (!res) return [];
  const d = res.data ?? res;
  if (Array.isArray(d)) return d;
  if (d?.syllabus) return d.syllabus;
  if (d?.data && Array.isArray(d.data)) return d.data;
  return [];
};

const Syllabus = () => {
  const [syllabus, setSyllabus] = useState([]);
  const [filteredSyllabus, setFilteredSyllabus] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedSyllabus, setSelectedSyllabus] = useState([]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [bookmarkedSyllabus, setBookmarkedSyllabus] = useState(new Set());
  const [previewSyllabus, setPreviewSyllabus] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', branch: '', year: '1st Year', description: '', tags: '', file: null });

  const { currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const branches = engineeringCourses.map(course => course.label);
  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  useEffect(() => { fetchSyllabus(); }, []);
  useEffect(() => { handleSearch(); }, [searchQuery, selectedBranch, activeTab, syllabus]);
  useEffect(() => { if (currentUser && syllabus.length > 0) checkBookmarks(); }, [currentUser, syllabus]);

  const getAuthHeader = () => {
    const token = currentUser?.token || localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchSyllabus = async () => {
    setLoading(true);
    try {
      const response = await syllabusAPI.getAll();
      const items = normalizeResponse(response, 'syllabus');
      setSyllabus(items);
      setFilteredSyllabus(items);
    } catch (error) {
      console.error('Failed to fetch syllabus:', error);
    } finally { setLoading(false); }
  };

  const handleSearch = () => {
    let filtered = Array.isArray(syllabus) ? syllabus : [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.branch || '').toLowerCase().includes(q) ||
        (item.tags && item.tags.some(tag => (tag || '').toLowerCase().includes(q)))
      );
    }
    if (activeTab !== 'all') filtered = filtered.filter(item => item.branch === activeTab);
    if (selectedBranch !== 'all' && activeTab === 'all') filtered = filtered.filter(item => item.branch === selectedBranch);
    setFilteredSyllabus(filtered);
  };

  const handleDownload = async (item) => {
  if (!currentUser) {
    toast({ title: "Login Required", description: "Please login to download syllabus.", variant: "destructive" });
    return;
  }
  try {
    const syllabusId = item.id || item._id;
    // Remove second argument so headers are not passed here
    await syllabusAPI.download(syllabusId);
    toast({ title: "Download Complete", description: `Downloaded: ${item.title}` });
  } catch (error) {
    toast({ title: "Download Failed", description: "Unable to download the syllabus. Please try again.", variant: "destructive" });
  }
};


  const handleView = (item) => {
    if (!currentUser) {
      toast({ title: "Login Required", description: "Please login to view syllabus.", variant: "destructive" });
      return;
    }
    const syllabusId = item.id || item._id;
    const pdfUrl = process.env.REACT_APP_BACKEND_URL + `/api/syllabus/${syllabusId}/view`;
    setPreviewSyllabus({ id: syllabusId, title: item.title, url: pdfUrl, syllabus: item });
    setIsPreviewOpen(true);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) return toast({ title: "File Required", description: "Please select a PDF file to upload.", variant: "destructive" });
    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('branch', uploadForm.branch);
    formData.append('year', uploadForm.year);
    formData.append('description', uploadForm.description);
    formData.append('tags', uploadForm.tags);
    formData.append('file', uploadForm.file);
    try {
      await syllabusAPI.create(formData, { headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' } });
      toast({ title: "Success", description: "Syllabus uploaded successfully!" });
      setIsUploadDialogOpen(false);
      setUploadForm({ title: '', branch: '', year: '1st Year', description: '', tags: '', file: null });
      fetchSyllabus();
    } catch (error) {
      toast({ title: "Upload Failed", description: "Failed to upload syllabus. Please try again.", variant: "destructive" });
    }
  };

  const handleDelete = async (syllabusId) => {
    if (!window.confirm('Are you sure you want to delete this syllabus?')) return;
    try {
      await syllabusAPI.delete(syllabusId, { headers: getAuthHeader() });
      toast({ title: "Success", description: "Syllabus deleted successfully!" });
      fetchSyllabus();
    } catch (error) {
      toast({ title: "Delete Failed", description: "Failed to delete syllabus. Please try again.", variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSyllabus.length === 0) return toast({ title: "No Selection", description: "Please select syllabus to delete.", variant: "destructive" });
    if (!window.confirm(`Are you sure you want to delete ${selectedSyllabus.length} syllabus?`)) return;
    try {
      await Promise.all(selectedSyllabus.map(id => syllabusAPI.delete(id, { headers: getAuthHeader() })));
      toast({ title: "Success", description: `${selectedSyllabus.length} syllabus deleted successfully!` });
      setSelectedSyllabus([]);
      fetchSyllabus();
    } catch (error) {
      toast({ title: "Delete Failed", description: "Failed to delete some syllabus. Please try again.", variant: "destructive" });
    }
  };

  const toggleSyllabusSelection = (syllabusId) => {
    setSelectedSyllabus(prev => prev.includes(syllabusId) ? prev.filter(id => id !== syllabusId) : [...prev, syllabusId]);
  };

  const checkBookmarks = async () => {
    try {
      if (!Array.isArray(syllabus) || syllabus.length === 0) return setBookmarkedSyllabus(new Set());
      const checks = await Promise.all(syllabus.map(async (item) => {
        const syllabusId = item.id || item._id;
        try {
          const resp = await bookmarksAPI.check('syllabus', syllabusId);
          return { id: syllabusId, bookmarked: resp?.data?.bookmarked || false };
        } catch (e) {
          return { id: syllabusId, bookmarked: false };
        }
      }));
      setBookmarkedSyllabus(new Set(checks.filter(c => c.bookmarked).map(c => c.id)));
    } catch (error) {
      console.error('Error checking bookmarks:', error);
    }
  };

  const handleBookmarkToggle = async (item) => {
    if (!currentUser) return toast({ title: "Login Required", description: "Please login to bookmark syllabus.", variant: "destructive" });
    const syllabusId = item.id || item._id;
    const isBookmarked = bookmarkedSyllabus.has(syllabusId);
    try {
      if (isBookmarked) {
        await bookmarksAPI.remove('syllabus', syllabusId, { headers: getAuthHeader() });
        setBookmarkedSyllabus(prev => { const s = new Set(prev); s.delete(syllabusId); return s; });
        toast({ title: "Removed", description: "Syllabus removed from bookmarks" });
      } else {
        await bookmarksAPI.create({ resource_type: 'syllabus', resource_id: syllabusId, category: 'General' }, { headers: getAuthHeader() });
        setBookmarkedSyllabus(prev => new Set([...prev, syllabusId]));
        toast({ title: "Bookmarked", description: "Syllabus added to bookmarks" });
      }
    } catch (error) {
      toast({ title: "Error", description: error?.response?.data?.detail || "Failed to update bookmark", variant: "destructive" });
    }
  };

  const getSyllabusByBranch = (branch) => {
    return (Array.isArray(filteredSyllabus) ? filteredSyllabus : []).filter(item => item.branch === branch);
  };
  const getSyllabusByYear = (branchSyllabus, year) => branchSyllabus.filter(item => item.year === year);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-purple-950 dark:via-gray-900 dark:to-pink-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Engineering Syllabus</h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">Complete course curriculum and syllabus organized by branches</p>
          </div>
          <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"><div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"><CardSkeleton count={6} /></div>
        </div>
      </div>
    );
  }

  const safeFiltered = Array.isArray(filteredSyllabus) ? filteredSyllabus : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-purple-950 dark:via-gray-900 dark:to-pink-950">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Engineering Syllabus</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">Complete course curriculum and syllabus organized by branches</p>
        </div>

        {isAdmin && (
          <div className="mb-6 flex flex-wrap gap-4">
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800"><Plus className="h-4 w-4 mr-2" /> Add Syllabus</Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                <DialogHeader><DialogTitle className="dark:text-white">Upload New Syllabus</DialogTitle></DialogHeader>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div><Label htmlFor="title" className="dark:text-white">Title</Label>
                    <Input id="title" placeholder="Enter syllabus title" value={uploadForm.title} onChange={(e) => setUploadForm({...uploadForm, title: e.target.value})} required className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div><Label htmlFor="branch" className="dark:text-white">Branch</Label>
                    <Select value={uploadForm.branch} onValueChange={(value) => setUploadForm({...uploadForm, branch: value})}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"><SelectValue placeholder="Select Branch" /></SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">{branches.map(branch => (<SelectItem key={branch} value={branch} className="dark:text-white dark:hover:bg-gray-600">{branch}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="year" className="dark:text-white">Year</Label>
                    <Select value={uploadForm.year} onValueChange={(value) => setUploadForm({...uploadForm, year: value})}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"><SelectValue placeholder="Select Year" /></SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">{years.map(year => (<SelectItem key={year} value={year} className="dark:text-white dark:hover:bg-gray-600">{year}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="description" className="dark:text-white">Description</Label>
                    <Textarea id="description" placeholder="Enter description (optional)" value={uploadForm.description} onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><Label htmlFor="tags" className="dark:text-white">Tags (comma separated)</Label>
                    <Input id="tags" placeholder="e.g., syllabus, official" value={uploadForm.tags} onChange={(e) => setUploadForm({...uploadForm, tags: e.target.value})} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><Label htmlFor="file" className="dark:text-white">PDF File</Label>
                    <Input id="file" type="file" accept=".pdf" onChange={(e) => setUploadForm({...uploadForm, file: e.target.files[0]})} required className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div className="flex gap-2"><Button type="submit" className="flex-1"><Upload className="h-4 w-4 mr-2" /> Upload Syllabus</Button>
                    <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {selectedSyllabus.length > 0 && (<Button onClick={handleBulkDelete} variant="destructive" className="bg-red-600 hover:bg-red-700"><Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selectedSyllabus.length})</Button>)}
          </div>
        )}

        <Card className="mb-8 dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input placeholder="Search syllabus..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 lg:grid-cols-7 mb-8 dark:bg-gray-800">
            <TabsTrigger value="all" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">All</TabsTrigger>
            {branches.map(branch => (<TabsTrigger key={branch} value={branch} className="text-xs lg:text-sm dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">{branch.split(' ')[0]}</TabsTrigger>))}
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {safeFiltered.map((item) => {
                const syllabusId = item.id || item._id;
                return (
                  <Card key={syllabusId} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1 dark:bg-gray-800 dark:border-gray-700">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {isAdmin && (<Checkbox checked={selectedSyllabus.includes(syllabusId)} onCheckedChange={() => toggleSyllabusSelection(syllabusId)} className="mb-2" data-testid={`syllabus-checkbox-${syllabusId}`} />)}
                          <CardTitle className="text-lg leading-tight mb-2 dark:text-white">{item.title}</CardTitle>
                          <div className="flex gap-2 mb-2">
                            <Badge variant="secondary" className="text-xs dark:bg-gray-700 dark:text-gray-300">{item.branch}</Badge>
                            <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">{item.year}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <Button variant="ghost" size="sm" onClick={() => handleBookmarkToggle(item)} className="p-1 h-auto" data-testid="bookmark-syllabus-all-btn">
                            <Heart className={`h-5 w-5 ${bookmarkedSyllabus.has(syllabusId) ? 'text-red-600 fill-current' : 'text-gray-400 dark:text-gray-500 hover:text-red-600'}`} />
                          </Button>
                          <GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          <FileText className="h-4 w-4 text-red-500" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {item.description && (<p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{item.description}</p>)}
                      {item.tags && item.tags.length > 0 && (<div className="flex flex-wrap gap-1">{item.tags.slice(0,3).map((tag,i) => <Badge key={i} variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">{tag}</Badge>)}{item.tags.length > 3 && <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">+{item.tags.length - 3}</Badge>}</div>)}
                      <div className="flex gap-2">
                        <Button onClick={() => handleView(item)} className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800" size="sm" data-testid="view-syllabus-btn"><Eye className="h-4 w-4 mr-2" /> View</Button>
                        <Button onClick={() => handleDownload(item)} className="flex-1 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800" size="sm" data-testid="download-syllabus-btn"><Download className="h-4 w-4 mr-2" /> Download</Button>
                        {isAdmin && (<Button onClick={() => handleDelete(syllabusId)} variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700" data-testid="delete-syllabus-btn"><Trash2 className="h-4 w-4" /></Button>)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {branches.map(branch => (
            <TabsContent key={branch} value={branch} className="space-y-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{branch}</h2>
                <p className="text-gray-600 dark:text-gray-300">Syllabus organized by academic year</p>
              </div>

              {years.map(year => {
                const yearSyllabus = getSyllabusByYear(getSyllabusByBranch(branch), year);
                if (yearSyllabus.length === 0) return null;
                return (
                  <div key={year} className="space-y-4">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">{year}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {yearSyllabus.map((item) => {
                        const syllabusId = item.id || item._id;
                        return (
                          <Card key={syllabusId} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1 dark:bg-gray-800 dark:border-gray-700">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  {isAdmin && (<Checkbox checked={selectedSyllabus.includes(syllabusId)} onCheckedChange={() => toggleSyllabusSelection(syllabusId)} className="mb-2" data-testid={`syllabus-year-checkbox-${syllabusId}`} />)}
                                  <CardTitle className="text-lg leading-tight mb-2 dark:text-white">{item.title}</CardTitle>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                  <Button variant="ghost" size="sm" onClick={() => handleBookmarkToggle(item)} className="p-1 h-auto" data-testid="bookmark-syllabus-btn"><Heart className={`h-5 w-5 ${bookmarkedSyllabus.has(syllabusId) ? 'text-red-600 fill-current' : 'text-gray-400 dark:text-gray-500 hover:text-red-600'}`} /></Button>
                                  <GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                  <FileText className="h-4 w-4 text-red-500" />
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {item.description && (<p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{item.description}</p>)}
                              <div className="flex gap-2">
                                <Button onClick={() => handleView(item)} className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800" size="sm" data-testid="view-syllabus-year-btn"><Eye className="h-4 w-4 mr-2" />View</Button>
                                <Button onClick={() => handleDownload(item)} className="flex-1 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800" size="sm" data-testid="download-syllabus-year-btn"><Download className="h-4 w-4 mr-2" />Download</Button>
                                {isAdmin && (<Button onClick={() => handleDelete(syllabusId)} variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700" data-testid="delete-syllabus-year-btn"><Trash2 className="h-4 w-4" /></Button>)}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          ))}
        </Tabs>

        {safeFiltered.length === 0 && (<div className="text-center py-12"><GraduationCap className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" /><h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No syllabus found</h3><p className="text-gray-600 dark:text-gray-400">Try adjusting your search criteria</p></div>)}
      </div>

      <PDFPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} pdfUrl={previewSyllabus?.url} title={previewSyllabus?.title} onDownload={() => previewSyllabus && handleDownload(previewSyllabus.syllabus)} />
    </div>
  );
};

export default Syllabus;
