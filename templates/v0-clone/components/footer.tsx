export function Footer() {
  return (
    <footer className="mt-auto py-8 text-center justify-end">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        <a href="/billing" className="hover:underline">
          Billing
        </a>{" "}
        •{" "}
        <a
          href="https://vibekit.sh/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Privacy
        </a>{" "}
        •{" "}
        <a
          href="https://vibekit.sh/terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Terms
        </a>{" "}
        •{" "}
        <a
          href="https://x.com/vibekit_sh"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          X
        </a>{" "}
        •{" "}
        <a
          href="https://github.com/superagent-ai/vibekit/tree/main/templates/v0-clone"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          GitHub
        </a>{" "}
        •{" "}
        <a
          href="/attribution"
          className="hover:underline"
        >
          Attribution
        </a>
      </p>
    </footer>
  );
} 