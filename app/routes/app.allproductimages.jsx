
// import { useFetcher, useLoaderData } from "@remix-run/react";
// import { useEffect, useState } from "react";

// export default function ProcessWatermarks() {
//   const fetcher = useFetcher();
//   const [progress, setProgress] = useState({
//     message: "Ready to start processing",
//     count: 0
//   });

//   const startProcessing = () => {
//     fetcher.load('/api/watermark');
//   };

//   useEffect(() => {
//     if (fetcher.data?.next && fetcher.data?.status === "in_progress") {
//       // Automatically load the next batch
//       fetcher.load(fetcher.data.next);
//     }

//     if (fetcher.data) {
//       setProgress({
//         message: fetcher.data.message,
//         count: fetcher.data.processedCount
//       });
//     }
//   }, [fetcher.data]);

//   return (
//     <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
//       <h1>Product Image Watermarking</h1>
      
//       <button
//         onClick={startProcessing}
//         disabled={fetcher.state === "loading"}
//         style={{
//           padding: '10px 20px',
//           background: fetcher.state === "loading" ? '#ccc' : '#0070f3',
//           color: 'white',
//           border: 'none',
//           borderRadius: '4px',
//           cursor: 'pointer',
//           fontSize: '16px'
//         }}
//       >
//         {fetcher.state === "loading" ? "Processing..." : "Start Processing"}
//       </button>

//       <div style={{ marginTop: '20px' }}>
//         <h3>Progress:</h3>
//         <p>{progress.message}</p>
//         <p>Processed: {progress.count} products</p>
        
//         {fetcher.data?.status === "completed" && (
//           <p style={{ color: 'green' }}>✅ Processing completed successfully!</p>
//         )}
        
//         {fetcher.data?.status === "error" && (
//           <p style={{ color: 'red' }}>❌ Error: {fetcher.data.message}</p>
//         )}
//       </div>
//     </div>
//   );
// }




import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";

export default function ProcessWatermarks() {
  const fetcher = useFetcher();
  const [progress, setProgress] = useState({
    message: "Ready to start processing",
    count: 0
  });
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [allProducts, setAllProducts] = useState(true);
  const [watermarkText, setWatermarkText] = useState("A1Build");
  const [watermarkAngle, setWatermarkAngle] = useState("-30"); // Default angle is -30 degrees
  const [watermarkColor, setWatermarkColor] = useState("#000000"); // default black
  const [opacity, setOpacity] = useState(0.2);
  const [cutoffRadius, setCutoffRadius] = useState(100);
  const [fontSize, setFontSize] = useState(12);

  useEffect(() => {
    // Fetch collections from API
    fetch("/api/collections")
      .then(res => res.json())
      .then(data => setCollections(data.collections || []));
  }, []);

  const startProcessing = () => {
    const params = new URLSearchParams();
    if (!allProducts && selectedCollections.length > 0) {
      selectedCollections.forEach(id => params.append("collectionIds", id));
    }
    if (watermarkText.trim()) {
      params.set("text", watermarkText.trim());
    }
    if (watermarkAngle.trim()) {
      params.set("angle", watermarkAngle.trim()); // Add angle parameter
    }
    if (watermarkColor.trim()) {
      params.set("color", watermarkColor.trim());
    }
    params.set("opacity", opacity.toString());
    params.set("cutoff", cutoffRadius);
    params.set("fontSize", fontSize);
    const endpoint = allProducts ? "/api/watermark" : "/api/collectionwatermark";
    fetcher.load(`${endpoint}?${params.toString()}`);
  };

  useEffect(() => {
    if (fetcher.data?.next && fetcher.data?.status === "in_progress") {
      const nextUrl = new URL(fetcher.data.next, window.location.origin);
  
      // Re-append collectionIds if specific collections are selected
      if (!allProducts && selectedCollections.length > 0) {
        selectedCollections.forEach(id =>
          nextUrl.searchParams.append("collectionIds", id)
        );
      }
      if (watermarkText.trim()) {
        nextUrl.searchParams.set("text", watermarkText.trim());
      }
      if (watermarkAngle.trim()) {
        nextUrl.searchParams.set("angle", watermarkAngle.trim()); // Re-add angle if needed
      }
      if (watermarkColor.trim()) {
        nextUrl.searchParams.set("color", watermarkColor.trim());
      }
      nextUrl.searchParams.set("opacity", opacity.toString());
      nextUrl.searchParams.set("cutoff", cutoffRadius);
      nextUrl.searchParams.set("fontSize", fontSize);

      fetcher.load(nextUrl.pathname + nextUrl.search);
    }
  
    if (fetcher.data) {
      setProgress({
        message: fetcher.data.message,
        count: fetcher.data.processedCount,
      });
    }
  }, [fetcher.data]);

  // return (
  //   <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
  //     <h1 style={{ marginBottom: '1rem' }}><strong> Product Image Watermarking:</strong></h1>

  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //         <input
  //           type="radio"
  //           name="target"
  //           checked={allProducts}
  //           onChange={() => setAllProducts(true)}
  //         />
  //         All Products
  //       </label>
  //       <label style={{ marginLeft: '1rem' }}>
  //         <input
  //           type="radio"
  //           name="target"
  //           checked={!allProducts}
  //           onChange={() => setAllProducts(false)}
  //         />
  //         Specific Collections
  //       </label>
  //     </div>

  //     {!allProducts && (
  //       <div>
  //       <select
  //         value={selectedCollections}
  //         onChange={(e) =>
  //           setSelectedCollections(Array.from(e.target.selectedOptions, o => o.value))
  //         }
  //         style={{ width: '300px', padding: '5px', marginBottom: '1rem' }}
  //       >
  //         {collections.map((col) => (
  //           <option key={col.id} value={col.id}>
  //             {col.title}
  //           </option>
  //         ))}
  //       </select>
  //       </div>
  //     )}

  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //        <strong> Watermark Text:</strong>
  //         <br />
  //         <input
  //           type="text"
  //           value={watermarkText}
  //           onChange={(e) => setWatermarkText(e.target.value)}
  //           placeholder="Enter watermark text"
  //           style={{marginTop: '5px',padding: '5px', width: '300px' }}
  //         />
  //       </label>
  //     </div>

  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //        <strong> Watermark Angle (degrees):</strong>
  //         <br />
  //         <input
  //           type="text"
  //           value={watermarkAngle}
  //           onChange={(e) => setWatermarkAngle(e.target.value)}
  //           placeholder="Enter angle in degrees"
  //           style={{marginTop: '5px', padding: '5px', width: '300px'}}
  //         />
  //       </label>
  //     </div>
  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //         <strong>Watermark Color:</strong>
  //         <br />
  //         <input
  //           type="color"
  //           value={watermarkColor}
  //           onChange={(e) => setWatermarkColor(e.target.value)}
  //           style={{ marginTop: '5px', padding: '5px', width: '80px', height: '40px', border: 'none' }}
  //         />
  //         {/* <span style={{ marginLeft: '10px' }}>{watermarkColor}</span> */}
  //       </label>
  //     </div>
  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //         <strong>Watermark Opacity:</strong> {opacity}
  //         <br />
  //         <input
  //           type="range"
  //           min="0"
  //           max="1"
  //           step="0.05"
  //           value={opacity}
  //           onChange={(e) => setOpacity(parseFloat(e.target.value))}
  //           style={{ width: '300px' }}
  //         />
  //       </label>
  //     </div>
  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //         <strong>Center Fade Radius:</strong> {cutoffRadius}px
  //         <br />
  //         <input
  //           type="range"
  //           min="0"
  //           max="250"
  //           step="25"
  //           value={cutoffRadius}
  //           onChange={(e) => setCutoffRadius(Number(e.target.value))}
  //           style={{ marginTop: '5px', width: '300px' }}
  //         />
  //       </label>
  //     </div>
  //     <div style={{ marginBottom: '1rem' }}>
  //       <label>
  //         <strong>Watermark Font Size:</strong> {fontSize}px
  //         <br />
  //         <input
  //           type="range"
  //           min="8"
  //           max="20"
  //           step="1"
  //           value={fontSize}
  //           onChange={(e) => setFontSize(Number(e.target.value))}
  //           style={{ marginTop: '5px', width: '300px' }}
  //         />
  //       </label>
  //     </div>

  //     <button
  //       onClick={startProcessing}
  //       disabled={fetcher.state === "loading"}
  //       style={{
  //         padding: '10px 20px',
  //         background: fetcher.state === "loading" ? '#ccc' : '#0070f3',
  //         color: 'white',
  //         border: 'none',
  //         borderRadius: '4px',
  //         cursor: 'pointer',
  //         fontSize: '16px'
  //       }}
  //     >
  //       {fetcher.state === "loading" ? "Processing..." : "Start Processing"}
  //     </button>

  //     <div style={{ marginTop: '20px' }}>
  //       <h3>Progress:</h3>
  //       <p>{progress.message}</p>
  //       <p>Processed: {progress.count} products</p>
  //       {fetcher.data?.status === "completed" && (
  //         <p style={{ color: 'green' }}>✅ Processing completed successfully!</p>
  //       )}
  //       {fetcher.data?.status === "error" && (
  //         <p style={{ color: 'red' }}>❌ Error: {fetcher.data.message}</p>
  //       )}
  //     </div>
  //   </div>
  // );

  return (
    <div
      style={{
        maxWidth: '700px',
        margin: '40px auto',
        padding: '30px',
        fontFamily: "'Inter', sans-serif",
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: '28px', marginBottom: '24px', fontWeight: 600 }}>
        Product Image Watermarking
      </h1>

      <div style={{ marginBottom: '20px', fontSize: '16px' }}>
        <label style={{ marginRight: '16px' }}>
          <input
            type="radio"
            name="target"
            checked={allProducts}
            onChange={() => setAllProducts(true)}
            style={{ marginRight: '6px' }}
          />
          All Products
        </label>
        <label>
          <input
            type="radio"
            name="target"
            checked={!allProducts}
            onChange={() => setAllProducts(false)}
            style={{ marginRight: '6px' }}
          />
          Specific Collections
        </label>
      </div>

      {!allProducts && (
        <select
          
          value={selectedCollections}
          onChange={(e) =>
            setSelectedCollections(Array.from(e.target.selectedOptions, (o) => o.value))
          }
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          {collections.map((col) => (
            <option key={col.id} value={col.id}>
              {col.title}
            </option>
          ))}
        </select>
      )}

      {/* Text input */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
          Watermark Text
        </label>
        <input
          type="text"
          value={watermarkText}
          onChange={(e) => setWatermarkText(e.target.value)}
          placeholder="Enter watermark text"
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '14px',
            borderRadius: '8px',
            border: '1px solid #ccc',
          }}
        />
      </div>

      {/* Angle */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
          Watermark Angle (degrees)
        </label>
        <input
          type="text"
          value={watermarkAngle}
          onChange={(e) => setWatermarkAngle(e.target.value)}
          placeholder="Enter angle in degrees"
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '14px',
            borderRadius: '8px',
            border: '1px solid #ccc',
          }}
        />
      </div>

      {/* Color */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
          Watermark Color
        </label>
        <input
          type="color"
          value={watermarkColor}
          onChange={(e) => setWatermarkColor(e.target.value)}
          style={{
            width: '60px',
            height: '40px',
            border: 'none',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Opacity */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
          Watermark Opacity: {opacity}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Cutoff Radius */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
          Center Fade Radius: {cutoffRadius}px
        </label>
        <input
          type="range"
          min="0"
          max="250"
          step="25"
          value={cutoffRadius}
          onChange={(e) => setCutoffRadius(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Font size */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
          Watermark Font Size: {fontSize}px
        </label>
        <input
          type="range"
          min="8"
          max="20"
          step="1"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Button */}
      <button
        onClick={startProcessing}
        disabled={fetcher.state === 'loading'}
        style={{
          width: '100%',
          padding: '12px',
          background: fetcher.state === 'loading' ? '#ccc' : '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          cursor: 'pointer',
          transition: 'background 0.3s ease',
        }}
      >
        {fetcher.state === 'loading' ? 'Processing...' : 'Start Processing'}
      </button>

      {/* Progress */}
      <div style={{ marginTop: '30px' }}>
        <h3 style={{ marginBottom: '10px' }}>Progress:</h3>
        <p>{progress.message}</p>
        <p>Processed: {progress.count} products</p>
        {fetcher.data?.status === 'completed' && (
          <p style={{ color: 'green', fontWeight: 500 }}>
            ✅ Processing completed successfully!
          </p>
        )}
        {fetcher.data?.status === 'error' && (
          <p style={{ color: 'red', fontWeight: 500 }}>❌ Error: {fetcher.data.message}</p>
        )}
      </div>
    </div>
  );
}
