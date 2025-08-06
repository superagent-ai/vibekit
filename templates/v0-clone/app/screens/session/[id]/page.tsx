import ClientPage from "./client-page";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Home({ params }: Props) {
  const { id } = await params;

  return <ClientPage id={id} />;
}
