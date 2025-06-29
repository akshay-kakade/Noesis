import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

if (!import.meta.env.VITE_GEMINI_API_KEY) {
  throw new Error("VITE_GEMINI_API_KEY is not defined. Please set it in your .env file");
}

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// --- Type Definitions ---
interface TreeNodeData {
  title: string;
  description: string;
  subtopics?: TreeNodeData[];
  _isLoading?: boolean;
}

interface KnowledgeTree {
  topic: string;
  description:string;
  subtopics: TreeNodeData[];
}

interface ProcessedNode extends TreeNodeData {
    x: number;
    y: number;
    children: ProcessedNode[];
    parent?: ProcessedNode;
    path: string; // "Root > Child > Grandchild"
    indexPath: number[];
}

// --- Layout Constants ---
const LEVEL_SPACING = 220;
const VERTICAL_SPACING = 30;
const NODE_HEIGHT = 40;
const NODE_RADIUS = 7;
const PADDING = 50;
const LONG_PRESS_DURATION = 200; // ms

// --- Helper Functions ---
const parseJsonFromText = (text: string): any => {
    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
        jsonStr = match[2].trim();
    }
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse JSON response:", e, "\nRaw text:", text);
        throw new Error("The response from the AI was not valid JSON. Please try again.");
    }
};

const getSystemInstruction = () => {
  return `You are an assistant that generates a structured, tree-style hierarchy of knowledge.

**CRITICAL: Your output MUST be a single, valid JSON object or array. Do not include any text, explanations, or markdown fences (like \`\`\`json) before or after the JSON content. Ensure all strings are properly escaped (e.g., use \\" for double quotes inside a string). Do not use trailing commas.**

**JSON Node Structure:**
Every node in the tree must be a JSON object with these keys:
- "title": A short string (2-5 words).
- "description": A detailed multi-paragraph description (2-4 paragraphs). Use newline characters (\\n) to separate paragraphs.
- "subtopics": An array of node objects. For nodes at the deepest level of a query, this should be an empty array [].

---

**1. Initial Tree Generation:**
If the user provides a new topic, generate a tree 2 levels deep. The root object must have "topic", "description", and "subtopics" keys.

EXAMPLE USER PROMPT: "Generate a knowledge tree for the topic: 'The Renaissance'"
EXAMPLE AI RESPONSE (JSON):
{
  "topic": "The Renaissance",
  "description": "A fervent period of European cultural, artistic, political and economic 'rebirth' following the Middle Ages, stretching from the 14th to the 17th century.\\nIt began in Italy as a cultural movement that saw a renewed interest in classical antiquity and humanist philosophy, which emphasized human potential and achievements.",
  "subtopics": [
    {
      "title": "Italian Renaissance",
      "description": "The birthplace of the Renaissance, characterized by figures like Leonardo da Vinci and Michelangelo.\\nThis era saw a massive surge in artistic creation funded by wealthy patrons like the Medici family, leading to masterpieces in painting, sculpture, and architecture.",
      "subtopics": [
        { "title": "Art and Patronage", "description": "Wealthy families, the Papacy, and guilds funded art, using it to signal power and piety. This system enabled artists to create ambitious works that defined the era.", "subtopics": [] },
        { "title": "Humanism", "description": "An intellectual movement focused on human potential, achievements, and classical Roman and Greek texts. It shifted focus from the divine to the human.", "subtopics": [] }
      ]
    },
    {
      "title": "Northern Renaissance",
      "description": "The Renaissance as it spread to Europe north of the Alps. It was more focused on religious reform and Christian Humanism than its Italian counterpart.",
      "subtopics": []
    }
  ]
}

---

**2. Expanding a Subtopic:**
If the user asks to expand an existing subtopic, respond ONLY with a JSON array of the immediate child nodes for that subtopic. Do not wrap it in another object.

EXAMPLE USER PROMPT: "The main topic is 'The Renaissance'. Expand the subtopic: 'Northern Renaissance'"
EXAMPLE AI RESPONSE (JSON Array):
[
  {
    "title": "Christian Humanism",
    "description": "A blend of humanist principles with Christian faith, influencing figures like Erasmus of Rotterdam.\\nIt aimed to reform society and the church through education and a return to early Christian texts, paving the way for the Protestant Reformation.",
    "subtopics": []
  },
  {
    "title": "Printing Press",
    "description": "Johannes Gutenberg's invention circa 1440 which revolutionized communication and learning.\\nIt allowed for the mass production of books and pamphlets, rapidly spreading new ideas, including humanist thought and religious critiques, across Europe.",
    "subtopics": []
  }
]
`;
};


// --- React Components ---

const Sidebar: React.FC<{ hoveredNode: ProcessedNode | null, selectedNode: ProcessedNode | null }> = ({ hoveredNode, selectedNode }) => {
    const nodeToDisplay = hoveredNode || selectedNode;

    const renderDescription = (desc: string) => {
        if (!desc) return null;
        // Split by newline and filter out empty strings that might result from trailing newlines
        return desc.split('\n').filter(p => p.trim() !== '').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
        ));
    };

    if (!nodeToDisplay) {
        return (
            <aside className="sidebar">
                <div className="sidebar-placeholder">Hover over or select a node to see its details.</div>
            </aside>
        );
    }
    const { title, description, path } = nodeToDisplay;
    return (
        <aside className="sidebar">
            <header className="sidebar-header">
                <p className="sidebar-path">Path: {path}</p>
                <h2 className="sidebar-title">{title}</h2>
            </header>
            <div className="sidebar-content">
                {renderDescription(description)}
            </div>
        </aside>
    );
};

const Edge: React.FC<{ source: ProcessedNode; target: ProcessedNode }> = ({ source, target }) => {
    const d = `M ${source.x + NODE_RADIUS} ${source.y} C ${source.x + LEVEL_SPACING / 2} ${source.y}, ${target.x - LEVEL_SPACING / 2} ${target.y}, ${target.x - NODE_RADIUS} ${target.y}`;
    return <path className="edge-path" d={d} />;
};

const Node: React.FC<{ 
    node: ProcessedNode; 
    onExpand: (indexPath: number[], title: string) => void; 
    onSelect: (node: ProcessedNode) => void; 
    onHover: (node: ProcessedNode) => void;
    onLeave: () => void;
    isSelected: boolean; 
}> = ({ node, onExpand, onSelect, onHover, onLeave, isSelected }) => {
    const canExpand = !node.subtopics || node.subtopics.length === 0;

    const handleNodeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(node);
        if (canExpand && !node._isLoading) {
            onExpand(node.indexPath, node.title);
        }
    };

    return (
        <g 
            className={`node-group ${isSelected ? 'selected' : ''}`} 
            transform={`translate(${node.x}, ${node.y})`} 
            onClick={handleNodeClick}
            onMouseEnter={() => onHover(node)}
            onMouseLeave={onLeave}
            onMouseDown={(e) => e.stopPropagation()} // Prevent pan start on node click
        >
            <circle className="node-circle" r={NODE_RADIUS} />
            <text className="node-text" x={NODE_RADIUS + 8} y="0">{node.title}</text>
            {node._isLoading && (
                 <g transform="scale(0.5) translate(-16, -16)">
                    <circle cx="16" cy="16" r="14" className="node-loader-bg" />
                    <circle cx="16" cy="16" r="14" className="node-loader-fg" style={{transformOrigin: '16px 16px'}}/>
                </g>
            )}
        </g>
    );
};

const BeautifulHeader: React.FC = () => (
  <header className="beautiful-header">
    <div className="header-content">
      <span className="header-logo">🌳</span>
      <div>
        <h1 className="header-title">Noesis Knowledge Tree</h1>
        <p className="header-tagline">Explore, Expand, and Visualize Knowledge</p>
      </div>
    </div>
  </header>
);

const BeautifulFooter: React.FC = () => (
  <footer className="beautiful-footer">
    <div className="footer-content">
      <span>© {new Date().getFullYear()} Noesis. All rights reserved.</span>
      <a href="https://github.com/akshaysharma096/Noesis" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
    </div>
  </footer>
);

const App: React.FC = () => {
    const [topic, setTopic] = useState<string>('Knowledge');
    const [treeData, setTreeData] = useState<KnowledgeTree | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<ProcessedNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<ProcessedNode | null>(null);
    
    // Pan and Zoom state
    const [isPanning, setIsPanning] = useState(false);
    const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, k: 1 });
    const panStart = useRef({ x: 0, y: 0 });
    const visContainerRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isPanning) return;
            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;
            panStart.current = { x: e.clientX, y: e.clientY };
            setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        };

        const handleMouseUp = () => {
            if (longPressTimeout.current) {
                clearTimeout(longPressTimeout.current);
                longPressTimeout.current = null;
            }
            if (isPanning) {
                setIsPanning(false);
                document.body.classList.remove('panning');
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isPanning]);


    const { nodes, edges } = useMemo(() => {
        if (!treeData) return { nodes: [], edges: [] };

        const allNodes: ProcessedNode[] = [];
        const allEdges: { source: ProcessedNode; target: ProcessedNode }[] = [];
        let yCounter = PADDING;
        let maxDepth = 0;

        function layout(nodeData: TreeNodeData, depth: number, parent: ProcessedNode | null, parentPath: string, indexPath: number[]): ProcessedNode {
            maxDepth = Math.max(maxDepth, depth);

            const processedNode: ProcessedNode = {
                ...nodeData,
                x: depth * LEVEL_SPACING + PADDING,
                y: 0, // Placeholder
                children: [],
                parent: parent || undefined,
                path: parentPath ? `${parentPath} > ${nodeData.title}` : nodeData.title,
                indexPath: indexPath,
            };

            if (nodeData.subtopics && nodeData.subtopics.length > 0) {
                processedNode.children = nodeData.subtopics.map((subtopic, index) =>
                    layout(subtopic, depth + 1, processedNode, processedNode.path, [...indexPath, index])
                );
                const firstChild = processedNode.children[0];
                const lastChild = processedNode.children[processedNode.children.length - 1];
                processedNode.y = firstChild.y + (lastChild.y - firstChild.y) / 2;
            } else {
                processedNode.y = yCounter;
                yCounter += NODE_HEIGHT + VERTICAL_SPACING;
            }
            
            allNodes.push(processedNode);
            if (parent) {
                allEdges.push({ source: parent, target: processedNode });
            }
            return processedNode;
        }
        
        const rootDataNode = { ...treeData, title: treeData.topic };
        const rootNode = layout(rootDataNode, 0, null, '', []);
        
        // Center the tree vertically on the root node
        const containerHeight = visContainerRef.current?.clientHeight || window.innerHeight;
        const rootYOffset = (containerHeight / (2 * viewTransform.k)) - rootNode.y;
        
        allNodes.forEach(node => {
            node.y += rootYOffset;
        });

        return {
            nodes: allNodes,
            edges: allEdges
        };
    }, [treeData, viewTransform.k]);

    const generateTree = async (prompt: string) => {
        setError(null);
        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-04-17',
                contents: prompt,
                config: { systemInstruction: getSystemInstruction(), responseMimeType: "application/json" },
            });
            if (!response.text) {
                throw new Error('No response text received from AI');
            }
            return parseJsonFromText(response.text);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            return null;
        }
    };

    const handleInitialGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!topic) return;
        setIsLoading(true);
        setTreeData(null);
        setSelectedNode(null);
        setHoveredNode(null);
        setViewTransform({x: 0, y: 0, k: 1});
        const data = await generateTree(`Generate a knowledge tree for the topic: "${topic}"`);
        if (data) {
            setTreeData(data);
             const initialRootNode = { ...data, title: data.topic, x: PADDING, y: 0, children: [], path: data.topic, indexPath: [] };
             setSelectedNode(initialRootNode);
        }
        setIsLoading(false);
    };
    
    const updateNodeState = (nodes: TreeNodeData[], path: number[], updater: (node: TreeNodeData) => TreeNodeData): TreeNodeData[] => {
        const index = path[0];
        if (index === undefined || index >= nodes.length) return nodes;

        return nodes.map((node, i) => {
            if (i === index) {
                if (path.length === 1) {
                    return updater(node);
                }
                return { ...node, subtopics: updateNodeState(node.subtopics || [], path.slice(1), updater) };
            }
            return node;
        });
    };

    const handleExpand = useCallback(async (path: number[], nodeTitle: string) => {
        if (!treeData) return;

        setTreeData(prevTree => prevTree ? { ...prevTree, subtopics: updateNodeState(prevTree.subtopics, path, node => ({ ...node, _isLoading: true })) } : null);

        const prompt = `The main topic is "${treeData.topic}". Expand the subtopic: "${nodeTitle}"`;
        const expandedData = await generateTree(prompt);

        if (expandedData) {
            setTreeData(prevTree => prevTree ? { ...prevTree, subtopics: updateNodeState(prevTree.subtopics, path, node => ({ ...node, subtopics: expandedData, _isLoading: false })) } : null);
        } else {
            setTreeData(prevTree => prevTree ? { ...prevTree, subtopics: updateNodeState(prevTree.subtopics, path, node => ({ ...node, _isLoading: false })) } : null);
        }
    }, [treeData]);
    
    const handleSelectNode = useCallback((node: ProcessedNode) => setSelectedNode(node), []);
    const handleHoverNode = useCallback((node: ProcessedNode) => setHoveredNode(node), []);
    const handleLeaveNode = useCallback(() => setHoveredNode(null), []);

    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        longPressTimeout.current = setTimeout(() => {
            panStart.current = { x: e.clientX, y: e.clientY };
            setIsPanning(true);
            document.body.classList.add('panning');
            longPressTimeout.current = null;
        }, LONG_PRESS_DURATION);
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newK = Math.max(0.1, Math.min(5, viewTransform.k + scaleAmount));
        
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newX = mouseX - (mouseX - viewTransform.x) * (newK / viewTransform.k);
        const newY = mouseY - (mouseY - viewTransform.y) * (newK / viewTransform.k);

        setViewTransform({ x: newX, y: newY, k: newK });
    };

    return (
        <div className="app-outer-container">
          <BeautifulHeader />
          <div className="app-container">
            <div className="main-content">
                <form onSubmit={handleInitialGenerate} className="input-form">
                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., Artificial Intelligence..." aria-label="Topic Input" />
                    <button type="submit" disabled={isLoading}>{isLoading ? 'Generating...' : 'Generate'}</button>
                </form>
                <div className="tree-visualization-container" ref={visContainerRef} onWheel={handleWheel}>
                    {isLoading && <div className="global-spinner"><div className="spinner"></div><p>Generating knowledge tree...</p></div>}
                    {error && <div className="error-message"><strong>Error:</strong> {error}</div>}
                    {treeData && !isLoading && (
                        <svg 
                            className="tree-svg" 
                            width="100%" 
                            height="100%"
                            onMouseDown={handleMouseDown}
                        >
                            <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.k})`}>
                                {edges.map((edge, i) => <Edge key={i} source={edge.source} target={edge.target} />)}
                                {nodes.map((node) => (
                                    <Node 
                                        key={node.path} 
                                        node={node} 
                                        onExpand={handleExpand} 
                                        onSelect={handleSelectNode}
                                        onHover={handleHoverNode}
                                        onLeave={handleLeaveNode}
                                        isSelected={selectedNode?.path === node.path}
                                    />
                                ))}
                            </g>
                        </svg>
                    )}
                </div>
            </div>
            <Sidebar hoveredNode={hoveredNode} selectedNode={selectedNode} />
          </div>
          <BeautifulFooter />
        </div>
    );
};

export default App;
