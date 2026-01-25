import { useState, useRef } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FileItem {
  file: File;
  status: 'pending' | 'success' | 'error';
  message?: string;
}

export default function ImportView() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles).map((file) => ({
      file,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const fileList = files.map((f) => f.file);
    const result = await api.uploadFiles(fileList);
    setUploading(false);

    if (result.success) {
      setResults(result.results || []);
      setFiles([]);
    } else {
      setResults([{ status: 'error', message: result.error || 'Upload failed' }]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
        <h5 className="text-base font-semibold mb-4">Import Pipeline Log Files</h5>

        <div
          ref={dropAreaRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            'border-2 border-dashed border-border rounded p-12 text-center mb-4 bg-card',
            'hover:border-primary/50 transition-colors cursor-pointer'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h5 className="text-base font-semibold mb-2">Drag & Drop Files Here</h5>
          <p className="text-muted-foreground mb-4">or</p>
          <Button>
            Browse Files
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".json"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Upload one or multiple JSON pipeline log files at once
          </p>
        </div>

        {files.length > 0 && (
          <div className="mb-4">
            <h5 className="text-base font-semibold mb-3">Files to Import</h5>
            <div className="border border-border rounded bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((fileItem, index) => (
                    <TableRow key={index}>
                      <TableCell>{fileItem.file.name}</TableCell>
                      <TableCell>{formatFileSize(fileItem.file.size)}</TableCell>
                      <TableCell>
                        <Badge variant={fileItem.status === 'error' ? 'destructive' : 'default'}>
                          {fileItem.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end mt-3">
              <Button onClick={handleUpload} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Uploading...' : 'Import Files'}
              </Button>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <h5 className="text-base font-semibold mb-3">Import Results</h5>
            <div className="border border-border rounded bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell>{result.fileName || 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge variant={result.status === 'error' ? 'destructive' : 'default'}>
                          {result.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{result.message || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
    </div>
  );
}
