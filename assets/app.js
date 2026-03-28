const App = () => {
    const [view, setView] = React.useState('upload')
    const [file, setFile] = React.useState(null)
    const [status, setStatus] = React.useState('idle')
    const [progress, setProgress] = React.useState(0)
    const [resultUrl, setResultUrl] = React.useState('')
    const [errorMsg, setErrorMsg] = React.useState('')
    const [isDragging, setIsDragging] = React.useState(false)
    const fileInputRef = React.useRef(null)

    React.useEffect(() => {
        initSession()
    }, [])

    const initSession = async () => {
        try {
            await axios.get('/api/user-info', { withCredentials: true })
        } catch (e) {
            console.warn('Session init:', e.message)
        }
    }

    const validateFile = (selectedFile) => {
        if (!selectedFile) return false
        if (selectedFile.size > 25 * 1024 * 1024) {
            setErrorMsg('File too large (Max 25MB)')
            setStatus('error')
            return false
        }
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'video/quicktime'
        ]
        if (!allowedTypes.includes(selectedFile.type)) {
            setErrorMsg('Unsupported format. Use Image or Video only.')
            setStatus('error')
            return false
        }
        return true
    }

    const handleFileSelect = (e) => {
        const selected = e.target.files[0]
        if (selected && validateFile(selected)) {
            setFile(selected)
            setStatus('idle')
            setErrorMsg('')
        }
        e.target.value = ''
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile && validateFile(droppedFile)) {
            setFile(droppedFile)
            setStatus('idle')
            setErrorMsg('')
        }
    }

    const handleUpload = async () => {
        if (!file) return
        setStatus('uploading')
        setProgress(0)
        setErrorMsg('')
        const formData = new FormData()
        formData.append('file', file)
        try {
            const response = await axios.post('/upload', formData, {
                withCredentials: true,
                onUploadProgress: (progressEvent) => {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                    setProgress(percent)
                }
            })
            if (response.data.status) {
                setResultUrl(response.data.result.url)
                setStatus('success')
                setFile(null)
            } else {
                throw new Error(response.data.message || 'Upload failed')
            }
        } catch (err) {
            setStatus('error')
            if (err.message === 'Network Error') {
                setErrorMsg('Network Error: Check connection')
            } else if (err.response) {
                setErrorMsg(err.response.data.message || 'Upload failed')
            } else if (err.code === 'ERR_BAD_REQUEST') {
                setErrorMsg('Session expired. Refreshing...')
                await initSession()
                handleUpload()
                return
            } else {
                setErrorMsg(err.message || 'Upload failed')
            }
        }
    }

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(resultUrl)
            const btn = document.getElementById('btn-copy')
            if (btn) {
                const originalText = btn.innerText
                btn.innerText = 'COPIED!'
                btn.classList.add('success-box')
                setTimeout(() => {
                    btn.innerText = originalText
                    btn.classList.remove('success-box')
                }, 2000)
            }
        } catch (err) {
            setErrorMsg('Failed to copy to clipboard')
        }
    }

    const resetUpload = () => {
        setFile(null)
        setStatus('idle')
        setResultUrl('')
        setErrorMsg('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const removeFile = () => {
        setFile(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const formatFileSize = (bytes) => {
        const mb = bytes / 1024 / 1024
        return mb.toFixed(2) + ' MB'
    }

    const getFileIcon = (fileType) => {
        if (fileType.startsWith('image/')) {
            return React.createElement('svg', { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                React.createElement('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }),
                React.createElement('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
                React.createElement('polyline', { points: '21 15 16 10 5 21' })
            )
        }
        return React.createElement('svg', { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
            React.createElement('polygon', { points: '23 7 16 12 23 17 23 7' }),
            React.createElement('rect', { x: '1', y: '5', width: '15', height: '14', rx: '2' })
        )
    }

    return React.createElement('div', { className: 'app-wrapper' },
        React.createElement('div', { className: 'center-screen' },
            React.createElement('div', { className: 'w-full max-w-md anim-pop' },
                React.createElement('div', { className: 'mb-6 flex items-end justify-between border-b-2 pb-4' },
                    React.createElement('h1', { className: 'text-3xl font-black tracking-tighter leading-none' },
                        'FIK ',
                        React.createElement('span', { className: 'text-blue-600' }, 'UPLOAD')
                    ),
                    React.createElement('div', { className: 'tab-nav' },
                        React.createElement('button', {
                            onClick: () => setView('upload'),
                            className: 'tab-btn ' + (view === 'upload' ? 'active' : '')
                        }, 'Upload'),
                        React.createElement('a', { href: '/docs', className: 'tab-btn' }, 'Docs')
                    )
                ),
                view === 'upload' && React.createElement('div', { className: 'relative' },
                    status === 'error' && React.createElement('div', {
                        className: 'hard-box error-box p-4 mb-6 flex justify-between items-start hard-shadow anim-fade-in'
                    },
                        React.createElement('div', null,
                            React.createElement('strong', { className: 'block text-xs uppercase mb-1' }, 'Error'),
                            React.createElement('p', { className: 'text-sm font-medium leading-tight' }, errorMsg)
                        ),
                        React.createElement('button', {
                            onClick: () => setStatus('idle'),
                            className: 'font-bold text-xl leading-none hover:opacity-70'
                        }, '\u00d7')
                    ),
                    status === 'success' ?
                        React.createElement('div', { className: 'hard-box p-8 text-center hard-shadow-static anim-slide-up' },
                            React.createElement('div', { className: 'flex justify-center mb-4 success-check' },
                                React.createElement('svg', { width: '56', height: '56', viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--green-600)', strokeWidth: '2' },
                                    React.createElement('path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }),
                                    React.createElement('polyline', { points: '22 4 12 14.01 9 11.01' })
                                )
                            ),
                            React.createElement('h2', { className: 'text-2xl font-black uppercase mb-2' }, 'Upload Complete'),
                            React.createElement('p', { className: 'text-gray-500 text-sm mb-6' }, 'File uploaded successfully'),
                            React.createElement('div', { className: 'url-display p-4 mb-6 hard-box text-left' },
                                React.createElement('p', { className: 'text-[10px] font-bold text-gray-400 uppercase mb-2' }, 'Public URL'),
                                React.createElement('p', { className: 'url-text' }, resultUrl)
                            ),
                            React.createElement('div', { className: 'action-grid' },
                                React.createElement('button', {
                                    onClick: resetUpload,
                                    className: 'hard-box action-btn hard-shadow'
                                }, 'Upload New'),
                                React.createElement('button', {
                                    id: 'btn-copy',
                                    onClick: copyToClipboard,
                                    className: 'hard-box action-btn primary hard-shadow'
                                }, 'Copy Link')
                            )
                        ) :
                        React.createElement('div', { className: 'hard-box p-6 hard-shadow-static' },
                            React.createElement('input', {
                                type: 'file',
                                ref: fileInputRef,
                                style: { display: 'none' },
                                onChange: handleFileSelect,
                                accept: 'image/*,video/*'
                            }),
                            file && React.createElement('div', { className: 'file-preview anim-fade-in' },
                                React.createElement('div', { className: 'file-preview-icon' },
                                    getFileIcon(file.type)
                                ),
                                React.createElement('div', { className: 'file-preview-info' },
                                    React.createElement('div', { className: 'file-preview-name' }, file.name),
                                    React.createElement('div', { className: 'file-preview-size' }, formatFileSize(file.size))
                                ),
                                React.createElement('button', {
                                    onClick: removeFile,
                                    className: 'file-preview-remove',
                                    title: 'Remove file'
                                },
                                    React.createElement('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                                        React.createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
                                        React.createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
                                    )
                                )
                            ),
                            React.createElement('div', {
                                onClick: () => fileInputRef.current && fileInputRef.current.click(),
                                onDragOver: handleDragOver,
                                onDragLeave: handleDragLeave,
                                onDrop: handleDrop,
                                className: 'upload-zone ' + (file ? 'file-selected' : '') + (isDragging ? ' drag-over' : '')
                            },
                                React.createElement('div', { className: 'icon' },
                                    file ?
                                        React.createElement('svg', { width: '40', height: '40', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                                            React.createElement('path', { d: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z' }),
                                            React.createElement('polyline', { points: '13 2 13 9 20 9' })
                                        ) :
                                        React.createElement('svg', { width: '48', height: '48', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
                                            React.createElement('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
                                            React.createElement('polyline', { points: '17 8 12 3 7 8' }),
                                            React.createElement('line', { x1: '12', y1: '3', x2: '12', y2: '15' })
                                        )
                                ),
                                React.createElement('div', { className: 'text-center mt-4 px-4' },
                                    file ?
                                        React.createElement(React.Fragment, null,
                                            React.createElement('p', { className: 'font-bold text-sm text-blue-900' }, 'File Selected'),
                                            React.createElement('p', { className: 'text-xs text-blue-500 mt-1' }, 'Click to change')
                                        ) :
                                        React.createElement(React.Fragment, null,
                                            React.createElement('p', { className: 'font-bold text-sm uppercase' }, 'Drop file or click to browse'),
                                            React.createElement('p', { className: 'text-xs text-gray-400 mt-2' }, 'Images or Video (Max 25MB)')
                                        )
                                ),
                                status === 'uploading' && React.createElement('div', { className: 'progress-container' },
                                    React.createElement('div', { className: 'progress-bar', style: { width: progress + '%' } })
                                )
                            ),
                            React.createElement('button', {
                                onClick: handleUpload,
                                disabled: !file || status === 'uploading',
                                className: 'hard-box upload-btn mt-6 hard-shadow'
                            },
                                status === 'uploading' ?
                                    React.createElement(React.Fragment, null,
                                        React.createElement('span', { className: 'loader' }),
                                        React.createElement('span', 'Uploading ' + progress + '%')
                                    ) :
                                    React.createElement(React.Fragment, null,
                                        React.createElement('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2.5' },
                                            React.createElement('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
                                            React.createElement('polyline', { points: '17 8 12 3 7 8' }),
                                            React.createElement('line', { x1: '12', y1: '3', x2: '12', y2: '15' })
                                        ),
                                        'Start Upload'
                                    )
                            )
                        )
                )
            )
        ),
        React.createElement('footer', { className: 'app-footer' },
            React.createElement('div', { className: 'footer-content' },
                React.createElement('p', { className: 'footer-text' }, 'Fik Uploader'),
                React.createElement('p', { className: 'footer-copyright' }, '\u00a9 2025 All rights reserved')
            )
        )
    )
}

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(React.createElement(App))
