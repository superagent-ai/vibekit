// Custom error page to prevent build issues with Next.js 15
// This is a minimal Pages Router error page that redirects to App Router
function Error() {
  return null;
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;