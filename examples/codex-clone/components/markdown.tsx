import React, { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type CodeComponentProps = React.ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const CodeComponent: React.FC<CodeComponentProps> = ({
  inline,
  className,
  children,
  ...props
}) => {
  const match = /language-(\w+)/.exec(className || "");
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  if (inline) {
    return (
      <code
        className="text-sm bg-muted/50 dark:bg-zinc-800 py-0.5 px-1 rounded-md"
        style={{ wordBreak: "break-all" }}
        {...props}
      >
        {children}
      </code>
    );
  }

  // Code block with language
  if (match) {
    return (
      <div className="border rounded-lg bg-background dark:bg-zinc-900 my-2 overflow-hidden">
        <div className="flex items-center justify-between bg-muted px-2 py-1 border-b">
          <span className="text-xs text-muted-foreground">{match[1]}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => {
              navigator.clipboard.writeText(String(children));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <CheckIcon className="w-4 h-4 text-green-500" />
            ) : (
              <CopyIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
        <ScrollArea className="max-w-full">
          <div className="px-4 py-2" style={{ maxWidth: "100%" }}>
            <SyntaxHighlighter
              language={match[1]}
              style={theme === "dark" ? oneDark : oneLight}
              customStyle={{
                fontSize: "12.5px",
                backgroundColor: "transparent",
                padding: "0",
                margin: "0",
                background: "none",
                overflow: "visible",
              }}
              wrapLongLines={false}
              PreTag="div"
              codeTagProps={{
                style: {
                  whiteSpace: "pre",
                  display: "block",
                },
              }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Code block without language
  return (
    <code
      className="relative rounded !bg-muted/50 dark:!bg-zinc-800 border border-muted-foreground/20 px-[0.3rem] py-[0.2rem] font-mono text-xs"
      style={{ wordBreak: "break-word" }}
    >
      {children}
    </code>
  );
};

const components: Partial<Components> = {
  code: CodeComponent,
  pre: ({ children }) => <>{children}</>,
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-4" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="py-1" {...props}>
      {children}
    </li>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-4" {...props}>
      {children}
    </ul>
  ),
  strong: ({ children, ...props }) => (
    <span className="font-semibold" {...props}>
      {children}
    </span>
  ),
  p: ({ children, ...props }) => (
    <p
      className="mb-2"
      style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => {
    // Check if this is a file reference link (contains line numbers)
    const childText = React.Children.toArray(children).join('');
    const fileRefPattern = /^(.+?):(\d+)(?:-(\d+))?$/;
    const isFileRef = fileRefPattern.test(childText);
    
    // Check if the URL is external (starts with http/https) or internal
    const isExternal = href?.startsWith("http") || href?.startsWith("https");

    if (isFileRef && isExternal) {
      const match = childText.match(fileRefPattern);
      if (match) {
        const [, filename, startLine, endLine] = match;
        return (
          <a
            className="inline-flex items-center gap-1 font-mono text-xs bg-muted/50 dark:bg-zinc-800 rounded px-1.5 py-0.5 hover:bg-muted/70 dark:hover:bg-zinc-700 transition-colors no-underline"
            href={href}
            target="_blank"
            rel="noreferrer"
            {...props}
          >
            <span className="text-blue-500">{filename}</span>
            <span className="text-muted-foreground">:</span>
            <span className="text-green-600 dark:text-green-400">
              {endLine ? `${startLine}-${endLine}` : startLine}
            </span>
          </a>
        );
      }
    }

    if (isExternal) {
      return (
        <a
          className="text-blue-500 hover:underline"
          style={{
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
          href={href}
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    }

    return (
      <Link
        passHref
        className="text-blue-500 hover:underline"
        style={{
          wordBreak: "break-word",
          overflowWrap: "break-word",
        }}
        href={href || "#"}
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1: ({ children, ...props }) => (
    <h1
      className="text-3xl font-semibold mt-6 mb-2"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-2xl font-semibold mt-6 mb-2"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-xl font-semibold mt-6 mb-2"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      className="text-lg font-semibold mt-6 mb-2"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5
      className="text-base font-semibold mt-6 mb-2"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6
      className="text-sm font-semibold mt-6 mb-2"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </h6>
  ),
  img: ({ alt, src, title, ...props }) => (
    <img
      className="max-w-full h-auto my-2 rounded"
      alt={alt}
      src={src}
      title={title}
      {...props}
    />
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-gray-300 dark:border-gray-700 pl-4 italic my-4"
      style={{ wordBreak: "break-word" }}
      {...props}
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <ScrollArea className="w-140 border rounded-lg my-4">
      <Table className="w-full" {...props}>
        {children}
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
  thead: ({ children, ...props }) => (
    <TableHeader {...props}>{children}</TableHeader>
  ),
  tbody: ({ children, ...props }) => (
    <TableBody {...props}>{children}</TableBody>
  ),
  tfoot: ({ children, ...props }) => (
    <TableFooter {...props}>{children}</TableFooter>
  ),
  tr: ({ children, ...props }) => <TableRow {...props}>{children}</TableRow>,
  th: ({ children, ...props }) => <TableHead {...props}>{children}</TableHead>,
  td: ({ children, ...props }) => <TableCell {...props}>{children}</TableCell>,
  hr: () => <Separator className="my-8 h-1" />,
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeRaw];

// Function to process citations and convert them to proper format
const processCitations = (
  content: string,
  repoUrl?: string,
  branch?: string
): string => {
  // Match citations in format 【F:filename†L1-L1】
  const citationRegex = /【F:([^†]+)†L(\d+)-L(\d+)】/g;

  return content.replace(
    citationRegex,
    (match, filename, startLine, endLine) => {
      const displayText =
        startLine === endLine
          ? `${filename}:${startLine}`
          : `${filename}:${startLine}-${endLine}`;

      const repoBaseUrl = repoUrl ? `${repoUrl}/blob/${branch || "main"}` : "#";
      const linkUrl =
        startLine === endLine
          ? `${repoBaseUrl}/${filename}#L${startLine}`
          : `${repoBaseUrl}/${filename}#L${startLine}-L${endLine}`;

      return `[${displayText}](${linkUrl}) `;
    }
  );
};

interface MarkdownProps {
  children: string;
  repoUrl?: string;
  branch?: string;
  onFileClick?: (filename: string, startLine?: number, endLine?: number) => void;
}

const NonMemoizedMarkdown = ({ children, repoUrl, branch, onFileClick }: MarkdownProps) => {
  const processedContent = processCitations(children, repoUrl, branch);

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.repoUrl === nextProps.repoUrl &&
    prevProps.branch === nextProps.branch &&
    prevProps.onFileClick === nextProps.onFileClick
);
