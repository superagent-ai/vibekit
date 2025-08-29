"use client";

import { useState, useEffect } from "react";
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  GitCommit,
  User,
  Calendar,
  FileText,
  Plus,
  Minus,
  Edit,
  Trash2,
  Copy,
  RefreshCw
} from "lucide-react";

interface CommitFile {
  path: string;
  status: string;
  statusText: string;
  diff?: string;
  content?: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface CommitDetails {
  hash: string;
  fullHash: string;
  message: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  committer: string;
  committerEmail: string;
  commitDate: string;
  diff: string;
  stats: string;
  files: Array<{
    status: string;
    statusText: string;
    path: string;
  }>;
  fileDiffs: CommitFile[];
}

interface CommitDetailsSheetProps {
  projectId: string;
  commit: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommitDetailsSheet({ projectId, commit, open, onOpenChange }: CommitDetailsSheetProps) {
  const [commitDetails, setCommitDetails] = useState<CommitDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (open && commit) {
      fetchCommitDetails();
    }
  }, [open, commit]);

  const fetchCommitDetails = async () => {
    if (!commit) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`/api/projects/${projectId}/git/commits/${commit.hash}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCommitDetails(data.data);
          // Select first file by default
          if (data.data.fileDiffs && data.data.fileDiffs.length > 0) {
            setSelectedFile(data.data.fileDiffs[0].path);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch commit details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'A':
        return <Plus className="h-3 w-3 text-green-600" />;
      case 'M':
        return <Edit className="h-3 w-3 text-blue-600" />;
      case 'D':
        return <Trash2 className="h-3 w-3 text-red-600" />;
      case 'R':
        return <RefreshCw className="h-3 w-3 text-purple-600" />;
      case 'C':
        return <Copy className="h-3 w-3 text-yellow-600" />;
      default:
        return <FileText className="h-3 w-3 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'A':
        return "bg-green-100 text-green-800";
      case 'M':
        return "bg-blue-100 text-blue-800";
      case 'D':
        return "bg-red-100 text-red-800";
      case 'R':
        return "bg-purple-100 text-purple-800";
      case 'C':
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDiff = (diff: string) => {
    if (!diff) return [];
    
    return diff.split('\n').map((line, index) => {
      let className = "font-mono text-xs whitespace-pre";
      if (line.startsWith('+') && !line.startsWith('+++')) {
        className += " bg-green-50 text-green-900";
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        className += " bg-red-50 text-red-900";
      } else if (line.startsWith('@@')) {
        className += " bg-blue-50 text-blue-900 font-semibold";
      } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
        className += " text-gray-500";
      }
      return { line, className, key: index };
    });
  };

  if (!commit) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl lg:max-w-5xl overflow-hidden p-0">
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Commit {commit.hash.substring(0, 7)}
          </SheetTitle>
          <SheetDescription>
            {commitDetails?.message || commit.message}
          </SheetDescription>
        </SheetHeader>
        
        <div className="px-6 pb-4">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{commitDetails?.author || commit.author}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{new Date(commitDetails?.authorDate || commit.date).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <Separator />

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
              <p className="text-muted-foreground">Loading commit details...</p>
            </div>
          </div>
        ) : commitDetails ? (
          <Tabs defaultValue="files" className="h-[calc(100vh-200px)]">
            <TabsList className="w-full rounded-none border-b px-6">
              <TabsTrigger value="files">
                Files Changed ({commitDetails.files.length})
              </TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="info">Commit Info</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="h-[calc(100%-48px)] m-0">
              <div className="flex h-full">
                {/* File list sidebar */}
                <div className="w-80 border-r overflow-y-auto">
                  <div className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Files Changed</h3>
                    <div className="space-y-1">
                      {commitDetails.fileDiffs.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors ${
                            selectedFile === file.path ? 'bg-muted' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {getStatusIcon(file.status)}
                            <span className="truncate flex-1">{file.path}</span>
                            <Badge className={`text-xs ${getStatusColor(file.status)}`}>
                              {file.statusText}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Diff viewer */}
                <div className="flex-1 overflow-hidden">
                  {selectedFile && (
                    <ScrollArea className="h-full">
                      <div className="p-4">
                        <div className="mb-4">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            {selectedFile}
                            {commitDetails.fileDiffs.find(f => f.path === selectedFile) && (
                              <Badge className={`text-xs ${
                                getStatusColor(commitDetails.fileDiffs.find(f => f.path === selectedFile)!.status)
                              }`}>
                                {commitDetails.fileDiffs.find(f => f.path === selectedFile)!.statusText}
                              </Badge>
                            )}
                          </h3>
                        </div>
                        <div className="bg-gray-50 rounded-md p-4 overflow-x-auto">
                          {commitDetails.fileDiffs.find(f => f.path === selectedFile)?.diff ? (
                            <div className="space-y-0">
                              {formatDiff(commitDetails.fileDiffs.find(f => f.path === selectedFile)!.diff!).map(({ line, className, key }) => (
                                <div key={key} className={className}>
                                  {line || ' '}
                                </div>
                              ))}
                            </div>
                          ) : commitDetails.fileDiffs.find(f => f.path === selectedFile)?.content ? (
                            <pre className="font-mono text-xs whitespace-pre">
                              {commitDetails.fileDiffs.find(f => f.path === selectedFile)!.content}
                            </pre>
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              {commitDetails.fileDiffs.find(f => f.path === selectedFile)?.isDeleted
                                ? 'File was deleted in this commit'
                                : 'No diff available for this file'}
                            </p>
                          )}
                        </div>
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stats" className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-3">Change Statistics</h3>
                  <pre className="bg-gray-50 rounded-md p-4 text-xs font-mono overflow-x-auto">
                    {commitDetails.stats}
                  </pre>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="info" className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Author</h3>
                    <p className="text-sm">{commitDetails.author}</p>
                    <p className="text-xs text-muted-foreground">{commitDetails.authorEmail}</p>
                    <p className="text-xs text-muted-foreground mt-1">{commitDetails.authorDate}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Committer</h3>
                    <p className="text-sm">{commitDetails.committer}</p>
                    <p className="text-xs text-muted-foreground">{commitDetails.committerEmail}</p>
                    <p className="text-xs text-muted-foreground mt-1">{commitDetails.commitDate}</p>
                  </div>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Commit Hash</h3>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {commitDetails.fullHash}
                  </code>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Commit Message</h3>
                  <pre className="text-sm whitespace-pre-wrap">{commitDetails.message}</pre>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-6">
            <p className="text-muted-foreground">Failed to load commit details</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}