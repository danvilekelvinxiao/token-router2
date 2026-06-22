export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/help",
      permanent: false,
    },
  };
}

export default function ImageHelpPage() {
  return null;
}
