"use client";

import * as React from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import Image from "next/image";

// Type definitions for the use-file-upload library
type FileUpload = {
  source: URL;
  name: string;
  size: number;
  file: File;
};

interface FileUploadProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  className?: string;
  accept?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  className,
  value,
  onChange,
  accept = "image/*",
}) => {
  const [preview, setPreview] = React.useState<string | undefined>(value);

  React.useEffect(() => {
    setPreview(value);
  }, [value]);

  // Process file to data URL
  const processFile = React.useCallback(
    (file: File) => {
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          setPreview(result);
          onChange?.(result);
        };
        reader.readAsDataURL(file);
      }
    },
    [onChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      [accept]: [],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles?.[0]) {
        processFile(acceptedFiles[0]);
      }
    },
  });

  const removeFile = () => {
    setPreview(undefined);
    onChange?.(undefined);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {preview ? (
        <div className="relative w-25 h-25">
          <div className="w-24 h-24 rounded-lg border border-input overflow-hidden bg-muted flex items-center justify-center relative">
            <Image
              src={preview}
              alt="Preview"
              fill
              className="object-cover"
              unoptimized={true}
              onError={() => {
                console.error("Image failed to load:", preview);
                setPreview(undefined);
                onChange?.(undefined);
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            onClick={removeFile}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "w-24 h-24 rounded-lg border-2 border-dashed border-input bg-muted/30 flex flex-col items-center justify-center cursor-pointer transition-colors hover:bg-muted/50",
            isDragActive && "border-primary bg-primary/10"
          )}
        >
          <input {...getInputProps()} />
          <Upload className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground text-center">
            Upload Logo
          </span>
        </div>
      )}
    </div>
  );
};

FileUpload.displayName = "FileUpload";

export { FileUpload };
