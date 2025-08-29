// Minimal Pages Router app to prevent build issues
// The actual app uses App Router
export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}