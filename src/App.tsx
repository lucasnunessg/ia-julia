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
        
        const prompt = mode === 'caiu-oab'
          ? `No texto abaixo, extraído de um PDF (com marcadores de página), localize todos os trechos marcados com a expressão 'caiu na OAB' (em qualquer variação: 'Caiu na OAB!', 'CAIU NA OAB', etc.). Para cada ocorrência, transcreva na íntegra o conteúdo associado à marcação (a questão, enunciado ou trecho completo) e indique a página em que aparece. Não resuma nem parafraseie. Se não houver nenhuma marcação 'caiu na OAB', responda exatamente: 'Nenhum trecho "caiu na OAB" encontrado.'\n\n${extractedText}`
          : mode === 'transcrever'
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
