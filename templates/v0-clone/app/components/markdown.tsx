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
import { ScrollArea } from "@/components/ui/scroll-area";

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
        className="text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md"
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
      <div className="border rounded-lg border-muted-foreground/20 my-2 bg-sidebar overflow-hidden">
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
              wrapLongLines={true}
              PreTag="div"
              codeTagProps={{
                style: {
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  overflowWrap: "anywhere",
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
      className="relative rounded !bg-sidebar border border-muted-foreground/20 px-[0.3rem] py-[0.2rem] font-mono text-xs"
      style={{ wordBreak: "break-all" }}
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
    <li className="py-1 text-sm" {...props}>
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
      className="mb-2 text-sm"
      style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => {
    return (
      <Link
        passHref
        className="text-blue-500 hover:underline"
        style={{
          wordBreak: "break-all",
          maxWidth: "100%",
          display: "inline-block",
          textOverflow: "ellipsis",
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
  table: ({ children, ...props }) => <Table {...props}>{children}</Table>,
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

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children
);
