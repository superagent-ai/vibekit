"use client";

import { useState, useEffect } from "react";
import { ChevronRight, Folder, FolderUp, Home, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

interface DirectoryBrowserProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
  initialPath?: string;
}

interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface DirectoryData {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryItem[];
  isRoot: boolean;
  separator: string;
}

export function DirectoryBrowser({ onSelect, onCancel, initialPath }: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(initialPath || '');

  const fetchDirectories = async (path?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/browse-directories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
      
      const result = await response.json();
      if (result.success) {
        const data = result.data as DirectoryData;
        setCurrentPath(data.currentPath);
        setDirectories(data.directories);
        setParentPath(data.parentPath);
        setSelectedPath(data.currentPath);
      }
    } catch (error) {
      console.error('Failed to fetch directories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectories(initialPath);
  }, []);

  const handleNavigate = (path: string) => {
    fetchDirectories(path);
  };

  const handleSelect = () => {
    onSelect(selectedPath);
  };

  const pathParts = currentPath.split(/[/\\]/).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-3xl h-[600px] flex flex-col">
        <CardHeader>
          <CardTitle>Select Project Directory</CardTitle>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchDirectories()}
              className="h-6 px-2"
            >
              <Home className="h-3 w-3" />
            </Button>
            {pathParts.map((part, index) => {
              const fullPath = '/' + pathParts.slice(0, index + 1).join('/');
              return (
                <div key={index} className="flex items-center">
                  <ChevronRight className="h-3 w-3 mx-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleNavigate(fullPath)}
                    className="h-6 px-2"
                  >
                    {part}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-hidden p-0">
          <div className="h-[400px] overflow-y-auto px-6">
            <div className="space-y-1 py-2">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : (
                <>
                  {parentPath && (
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-9 px-3"
                      onClick={() => handleNavigate(parentPath)}
                    >
                      <FolderUp className="mr-2 h-4 w-4" />
                      <span className="text-muted-foreground">..</span>
                    </Button>
                  )}
                  
                  {directories.map((dir) => (
                    <div key={dir.path} className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start h-9 px-3"
                        onClick={() => handleNavigate(dir.path)}
                      >
                        <Folder className="mr-2 h-4 w-4" />
                        {dir.name}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={() => setSelectedPath(dir.path)}
                      >
                        {selectedPath === dir.path && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                    </div>
                  ))}
                  
                  {directories.length === 0 && !parentPath && (
                    <p className="text-center text-muted-foreground py-8">
                      No subdirectories found
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="flex items-center justify-between">
          <div className="flex-1 text-sm text-muted-foreground truncate">
            Selected: {selectedPath || 'None'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleSelect}
              disabled={!selectedPath}
            >
              Select This Folder
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}