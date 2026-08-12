import { useState } from 'react'
import OpenAI from 'openai'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'

// Configurar o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [mode, setMode] = useState<'resumir' | 'transcrever' | 'caiu-oab'>('resumir')

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      fullText += `\n--- Página ${i} ---\n${pageText}\n`
    }

    return fullText
  }

  const extractCaiuNaOabSnippets = (fullText: string, isResumo: boolean): string => {
    const pages = fullText.split(/\n--- Página (\d+) ---\n/)
    const snippets: string[] = []
    // Resumo: corte maior pra pegar a seção toda; caderno de leis: só o artigo
    const CONTEXT_BEFORE = isResumo ? 2500 : 900
    const CONTEXT_AFTER = isResumo ? 400 : 100

    // pages = ['', '1', textoPag1, '2', textoPag2, ...]
    for (let i = 1; i < pages.length; i += 2) {
      const pageNum = pages[i]
      const pageText = pages[i + 1] || ''
      const regex = /caiu\s+na\s+oab[^*\n]*/gi
      const ranges: Array<[number, number]> = []
      let match
      while ((match = regex.exec(pageText)) !== null) {
        const start = Math.max(0, match.index - CONTEXT_BEFORE)
        const end = Math.min(pageText.length, match.index + match[0].length + CONTEXT_AFTER)
        const last = ranges[ranges.length - 1]
        if (last && start <= last[1]) {
          last[1] = end // mescla marcações próximas num único trecho
        } else {
          ranges.push([start, end])
        }
      }
      for (const [start, end] of ranges) {
        snippets.push(`[Página ${pageNum}] ...${pageText.slice(start, end).trim()}...`)
      }
    }

    return snippets.join('\n\n=====\n\n')
  }

  const handleAnalyze = async () => {
    if (!file) return

    setLoading(true)
    setResult('')

    try {
      const fileType = file.type

      // Para imagens
      if (fileType.startsWith('image/')) {
        const base64 = await convertToBase64(file)
        
        const prompt = mode === 'caiu-oab'
          ? "Nesta imagem, localize os trechos marcados com a expressão 'caiu na OAB' (em qualquer variação: 'Caiu na OAB!', 'CAIU NA OAB', etc.). Transcreva na íntegra apenas o conteúdo desses trechos (a questão, enunciado ou texto associado à marcação). Se não houver nenhuma marcação 'caiu na OAB', responda exatamente: 'Nenhum trecho \"caiu na OAB\" encontrado.'"
          : mode === 'transcrever'
          ? "Por favor, transcreva todo o texto visível nesta imagem de forma precisa e completa."
          : "Por favor, analise esta imagem e forneça um resumo detalhado do que você vê, incluindo texto se houver."
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: base64,
                  },
                },
              ],
            },
          ],
        })

        setResult(response.choices[0].message.content || 'Sem resultado')
      } 
      // Para PDFs - extrair texto e processar
      else if (fileType === 'application/pdf') {
        const extractedText = await extractTextFromPDF(file)

        if (mode === 'caiu-oab') {
          // É resumo se o nome do arquivo ou a primeira página do PDF disser "resumo"
          const firstPage = extractedText.split(/\n--- Página \d+ ---\n/)[1] || ''
          const isResumo = /resumo/i.test(file.name) || /resumo/i.test(firstPage)
          const snippets = extractCaiuNaOabSnippets(extractedText, isResumo)

          if (!snippets) {
            setResult('Nenhum trecho "caiu na OAB" encontrado no texto do PDF. (Se o PDF for escaneado/imagem, a extração de texto não funciona.)')
            return
          }

          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: `Abaixo estão trechos de um material de estudo, extraídos automaticamente ao redor de marcações como '*CAIU NA OAB 43*' (o número indica o exame da OAB em que o tema caiu). Cada trecho indica a página e os trechos são separados por '====='.\n\nPara cada marcação, identifique o conteúdo ao qual ela se refere e transcreva-o COMPLETO. Regras:\n- Se a marcação estiver ao lado de um artigo/inciso/parágrafo de lei, transcreva o dispositivo inteiro.\n- Se a marcação estiver dentro de um tópico ou seção de resumo (ex.: '1.2 Poder Constituinte Derivado'), transcreva TODO o conteúdo desse tópico desde o título da seção — incluindo definições, características e listas de itens — e não apenas a frase imediatamente anterior à marcação.\n- Se houver mais de uma marcação no mesmo tópico, transcreva o tópico uma única vez, listando todos os exames no cabeçalho.\n\nFormato de saída para cada item:\n\n⚖️ CAIU NA OAB <exame(s)> — Página <n>\n<conteúdo completo do tópico/dispositivo>\n\nNão resuma nem parafraseie o conteúdo. Não invente nada além do que está nos trechos.\n\n${snippets}`
              }
            ],
          })

          setResult(response.choices[0].message.content || 'Sem resultado')
          return
        }

        const prompt = mode === 'transcrever'
          ? `Por favor, transcreva e organize o seguinte conteúdo extraído do PDF de forma clara e estruturada:\n\n${extractedText}`
          : `Por favor, analise e resuma o seguinte conteúdo do PDF de forma clara e objetiva:\n\n${extractedText}`
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
        })

        setResult(response.choices[0].message.content || 'Sem resultado')
      }
      // Para PowerPoint
      else if (fileType === 'application/vnd.ms-powerpoint' ||
               fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        
        const base64 = await convertToBase64(file)
        
        const prompt = mode === 'caiu-oab'
          ? "Nesta apresentação, localize os trechos marcados com a expressão 'caiu na OAB' (em qualquer variação) e transcreva na íntegra apenas o conteúdo desses trechos, indicando o slide. Se não houver nenhuma marcação 'caiu na OAB', responda exatamente: 'Nenhum trecho \"caiu na OAB\" encontrado.'"
          : mode === 'transcrever'
          ? "Por favor, transcreva TODO o conteúdo textual desta apresentação PowerPoint de forma completa e organizada, slide por slide."
          : "Por favor, analise e resuma o conteúdo principal desta apresentação PowerPoint."
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: base64,
                  },
                },
              ],
            },
          ],
        })

        setResult(response.choices[0].message.content || 'Sem resultado')
      } else {
        setResult('Formato de arquivo não suportado. Use imagens, PDF ou PowerPoint.')
      }
    } catch (error) {
      setResult(`Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>Resumidor da Julinha</h1>
      <p>Faz o upload ai e pede p ele resumir ou transcrever</p>

      <div className="mode-selector">
        <label>
          <input
            type="radio"
            value="resumir"
            checked={mode === 'resumir'}
            onChange={(e) => setMode(e.target.value as 'resumir' | 'transcrever' | 'caiu-oab')}
          />
          📝 Resumir
        </label>
        <label>
          <input
            type="radio"
            value="transcrever"
            checked={mode === 'transcrever'}
            onChange={(e) => setMode(e.target.value as 'resumir' | 'transcrever' | 'caiu-oab')}
          />
          📋 Transcrever
        </label>
        <label>
          <input
            type="radio"
            value="caiu-oab"
            checked={mode === 'caiu-oab'}
            onChange={(e) => setMode(e.target.value as 'resumir' | 'transcrever' | 'caiu-oab')}
          />
          ⚖️ Caiu na OAB
        </label>
      </div>

      <div 
        className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          onChange={handleChange}
          accept="image/*,.pdf,.ppt,.pptx"
          style={{ display: 'none' }}
        />
        <label htmlFor="file-upload">
          {file ? (
            <div className="file-info">
              <span>📎 {file.name}</span>
              <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
            </div>
          ) : (
            <div>
              <p>🖱️ Clique ou arraste arquivos aqui</p>
              <small>Suporta: Imagens, PDF, PowerPoint</small>
            </div>
          )}
        </label>
      </div>

      <button 
        onClick={handleAnalyze} 
        disabled={!file || loading}
        className="analyze-btn"
      >
        {loading ? '⏳ Processando...' : mode === 'caiu-oab' ? '⚖️ Extrair "Caiu na OAB"' : `🚀 ${mode === 'resumir' ? 'Resumir' : 'Transcrever'} Documento`}
      </button>

      {result && (
        <div className="result-box">
          <h2>📝 Resultado:</h2>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  )
}

export default App
