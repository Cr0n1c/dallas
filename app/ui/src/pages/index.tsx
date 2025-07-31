import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/infrastructure');
  }, [router]);

  return null; // Don't render anything since we're redirecting
}
